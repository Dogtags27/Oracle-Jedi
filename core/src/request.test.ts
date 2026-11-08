import { describe, expect, it } from "vitest";
import { extractRequest } from "./request";

describe("request extractor (on-device, rules only)", () => {
  it("pulls the claim, the ask and the pressure out of a document request", () => {
    const x = extractRequest(
      "Hi,\nThis is Maple Street Tax. To finish your return please reply with your W-2 and Social Security number today.\nUpload here: https://docs.maple-street-files.co/upload\nQuestions? (617) 555-0142\n\nMaple Street Tax",
      "Maple Street Tax <maplestreet.tax.help@gmail.com>",
    );
    expect(x.isDocumentRequest).toBe(true);
    expect(x.claimedOrg).toBe("Maple Street Tax");
    expect(x.senderDomain).toBe("gmail.com");
    expect(x.requestedItems).toEqual(expect.arrayContaining(["w2", "ssn"]));
    expect(x.linkDomains).toEqual(["maple-street-files.co"]);
    expect(x.phones).toHaveLength(1);
    expect(x.pressureSignals).toContain("deadline");
    expect(x.language).toBe("en");
  });

  it("ignores ordinary email", () => {
    const x = extractRequest("Lunch tomorrow at noon? I'll bring the slides.", "Sam <sam@example.com>");
    expect(x.isDocumentRequest).toBe(false);
  });
});
