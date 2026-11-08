import { describe, expect, it } from "vitest";
import { abaChecksum, describeFindings, detect, luhn, redactText } from "./detect";

const kinds = (text: string) => detect(text).map((f) => [f.kind, f.value]);

describe("detectors (on-device, rules + checksums)", () => {
  it("finds SSNs, tags the SSA advertising range as SAMPLE, and skips impossible ones", () => {
    const f = detect("Employee SSN 987-65-4321. Spouse 123-45-6789. Bad 666-12-3456 and 000-12-3456.");
    expect(f.filter((x) => x.kind === "ssn").map((x) => x.value)).toEqual(["987-65-4321", "123-45-6789"]);
    expect(f[0]?.sample).toBe(true);
    expect(f[1]?.sample).toBeUndefined();
  });

  it("needs context for bare 9-digit numbers", () => {
    expect(kinds("SSN: 123456789")).toEqual([["ssn", "123456789"]]);
    expect(kinds("Order 123456789 shipped")).toEqual([]);
    expect(kinds("Social security number\n123456789")).toEqual([["ssn", "123456789"]]);
  });

  it("doesn't borrow a label from another line", () => {
    expect(kinds("ITIN 912-78-6091\nRouting number: 011000015")).toEqual([["itin", "912-78-6091"], ["routing", "011000015"]]);
    expect(kinds("SSN 123-45-6789\nReference 561172842")).toEqual([["ssn", "123-45-6789"]]);
  });

  it("separates ITINs and EINs", () => {
    expect(kinds("ITIN 912-70-1234")).toEqual([["itin", "912-70-1234"]]);
    expect(detect("Employer identification number (EIN) 12-3456789")[0]).toMatchObject({ kind: "ein", confidence: "high" });
  });

  it("validates routing numbers with the ABA checksum and card numbers with Luhn", () => {
    expect(abaChecksum("011000015")).toBe(true);
    expect(abaChecksum("011000016")).toBe(false);
    expect(luhn("4111 1111 1111 1111")).toBe(true);
    expect(kinds("Routing number: 011000015")).toEqual([["routing", "011000015"]]);
    expect(kinds("Routing number: 011000016")).toEqual([]);
    expect(kinds("Card 4111 1111 1111 1111 exp 04/29")).toEqual([["card", "4111 1111 1111 1111"]]);
    expect(kinds("Tracking 4111 1111 1111 1112")).toEqual([]);
  });

  it("finds account numbers and dates of birth only next to their labels", () => {
    expect(kinds("Account number: 000123456789")).toEqual([["account", "000123456789"]]);
    expect(kinds("Invoice 000123456789")).toEqual([]);
    expect(kinds("Date of birth: 04/12/1986")).toEqual([["dob", "04/12/1986"]]);
    expect(kinds("Meeting on 04/12/2026")).toEqual([]);
  });

  it("finds passport MRZ lines", () => {
    const mrz = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10";
    expect(detect(mrz).filter((f) => f.kind === "mrz")).toHaveLength(2);
  });

  it("describes and redacts in place", () => {
    const text = "SSN 987-65-4321, account # 4400123456";
    const f = detect(text);
    expect(describeFindings(f)).toBe("1 Social Security number and 1 account number");
    const out = redactText(text, f);
    expect(out).not.toContain("987-65-4321");
    expect(out).not.toContain("4400123456");
    expect(out.length).toBe(text.length);
    expect(detect(out, ["ssn", "account"])).toEqual([]);
  });

  it("stays quiet on ordinary numbers", () => {
    expect(detect("Total $84,200.00 due 11/15/2026. Order #4815162342. Zip 02115. Call (617) 555-0199.", ["ssn", "itin", "ein", "routing", "card", "account", "dob", "mrz"])).toEqual([]);
  });
});
