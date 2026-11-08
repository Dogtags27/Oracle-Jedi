import { describe, expect, it } from "vitest";
import {
  WORDS,
  generateOfficeKeys,
  lockKeys,
  openSealed,
  safetyWords,
  sealForPerson,
  sealToOffice,
  unlockKeys,
  utf8,
  verifyBundle,
  verifyObject,
  signObject,
  fromUtf8,
  toB64,
} from "./index";

const office = generateOfficeKeys("MapleStreetTax.com", "Maple Street Tax");
const doc = utf8("W-2 Wage and Tax Statement · SSN 987-65-4321 · ".repeat(3000));
const meta = { name: "w2.pdf", type: "application/pdf", size: doc.length };

describe("office bundle", () => {
  it("is signed, normalized and has 6 safety words", async () => {
    const check = await verifyBundle(office.bundle);
    expect(check.ok).toBe(true);
    expect(office.bundle.domain).toBe("maplestreettax.com");
    expect(safetyWords(check.fingerprint)).toHaveLength(6);
    expect(new Set(WORDS).size).toBe(256);
  });

  it("rejects a tampered bundle and a DNS mismatch", async () => {
    expect((await verifyBundle({ ...office.bundle, domain: "evil.com" })).reason).toBe("bad_signature");
    expect((await verifyBundle(office.bundle, { dnsFingerprint: "00" })).reason).toBe("dns_mismatch");
  });
});

describe("HANDOFF-PQ1 envelope", () => {
  it("round-trips to an office and hides size and name", async () => {
    const sealed = await sealToOffice(doc, meta, office.bundle);
    expect(sealed.header.paddedSize).toBeGreaterThanOrEqual(doc.length);
    expect(sealed.header.nChunks).toBeGreaterThan(0);
    expect(fromUtf8(sealed.ciphertext)).not.toContain("987-65-4321");
    expect(JSON.stringify(sealed.header)).not.toContain("w2.pdf");
    const opened = await openSealed(sealed, office.secret);
    expect(opened.meta.name).toBe("w2.pdf");
    expect(fromUtf8(opened.data)).toBe(fromUtf8(doc));
  });

  it("fails on tamper, truncation, header swap and wrong key", async () => {
    const sealed = await sealToOffice(doc, meta, office.bundle);
    const tampered = sealed.ciphertext.slice();
    tampered[100] ^= 1;
    await expect(openSealed({ ...sealed, ciphertext: tampered }, office.secret)).rejects.toThrow();
    await expect(openSealed({ ...sealed, ciphertext: sealed.ciphertext.slice(0, -16) }, office.secret)).rejects.toThrow();
    await expect(openSealed({ header: { ...sealed.header, expires: "2099-01-01T00:00:00.000Z" }, ciphertext: sealed.ciphertext }, office.secret)).rejects.toThrow();
    const other = generateOfficeKeys("other.com", "Other");
    await expect(openSealed(sealed, other.secret)).rejects.toThrow();
  });

  it("person mode needs both key halves", async () => {
    const sealed = await sealForPerson(doc, meta);
    expect(fromUtf8((await openSealed(sealed, { k1: sealed.k1, k2: sealed.k2 })).data)).toBe(fromUtf8(doc));
    await expect(openSealed(sealed, { k1: sealed.k1, k2: sealed.k1 })).rejects.toThrow();
  });
});

describe("keys at rest and receipts", () => {
  it("locks with argon2id and rejects a wrong passphrase", async () => {
    const kit = await lockKeys(office, "may the force", { m: 1024, t: 1, p: 1 });
    const serialized = JSON.stringify(kit);
    expect(serialized).not.toContain(toB64(office.secret.kemSk).slice(0, 40));
    expect(serialized).not.toContain(toB64(office.secret.sigSk.subarray(32, 64)).slice(0, 40));
    const back = await unlockKeys(kit, "may the force");
    expect(back.secret.kemSk).toEqual(office.secret.kemSk);
    await expect(unlockKeys(kit, "wrong")).rejects.toThrow("wrong_passphrase");
  });

  it("signs and verifies receipts with ML-DSA-65", () => {
    const receipt = { id: "ho_1", openedAt: "2026-11-08T02:14:00.000Z" };
    const sig = signObject(receipt, office.secret.sigSk);
    expect(verifyObject(receipt, sig, office.bundle.sigPk)).toBe(true);
    expect(verifyObject({ ...receipt, id: "ho_2" }, sig, office.bundle.sigPk)).toBe(false);
  });
});
