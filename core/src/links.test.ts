import { describe, expect, it } from "vitest";
import { analyzeAttachment, analyzeLink, isLookalike, unwrapRedirect } from "./links";
import { extractRequest } from "./request";

const official = { officialDomain: "maplestreettax.com", officialName: "Maple Street Tax" };

describe("link guard (on-device, before the click)", () => {
  it("catches link text that lies about the destination", () => {
    const x = analyzeLink("https://maple-street-taxdocs.co/upload", "https://www.maplestreettax.com/upload");
    expect(x.level).toBe("high");
    expect(x.risks).toContain("text_mismatch");
  });

  it("flags look-alikes of the official domain once it is known", () => {
    expect(isLookalike("maple-street-taxdocs.co", "maplestreettax.com")).toBe(true);
    expect(isLookalike("rnaplestreettax.com", "maplestreettax.com")).toBe(true);
    expect(isLookalike("maplestreettax.com.secure-docs.io", "maplestreettax.com")).toBe(true);
    expect(isLookalike("oakavenuecpa.com", "maplestreettax.com")).toBe(false);
    expect(analyzeLink("https://maplestreettax.co/login", "", official).risks).toContain("lookalike");
    expect(analyzeLink("https://www.maplestreettax.com/contact", "", official).level).toBe("low");
  });

  it("sees through @ decoys, punycode, raw IPs, scripts and shorteners", () => {
    expect(analyzeLink("https://maplestreettax.com@203.0.113.9/login").risks).toEqual(expect.arrayContaining(["userinfo", "ip_host"]));
    expect(analyzeLink("https://xn--mplestreettax-9fb.com/").risks).toContain("punycode");
    expect(analyzeLink("javascript:alert(1)").level).toBe("high");
    expect(analyzeLink("https://bit.ly/3abc").level).toBe("medium");
    expect(analyzeLink("https://docs-portal.netlify.app/w2").risks).toContain("free_host");
  });

  it("trusts our own app host but not decoys that borrow it", () => {
    const own = { trustedHosts: ["oracle-jedi.vercel.app"] };
    expect(analyzeLink("https://oracle-jedi.vercel.app/h/ho_x#k", "Sealed document", own).level).toBe("low");
    expect(analyzeLink("https://evil.vercel.app/h/ho_x", "", own).risks).toContain("free_host");
    expect(analyzeLink("https://oracle-jedi.vercel.app@203.0.113.9/", "", own).level).toBe("high");
  });

  it("unwraps redirect wrappers to judge the real destination", () => {
    expect(unwrapRedirect("https://www.google.com/url?q=https://maple-street-taxdocs.co/x&sa=D")).toBe("https://maple-street-taxdocs.co/x");
  });

  it("flags dangerous attachments, including disguised ones", () => {
    expect(analyzeAttachment("W2_2025.pdf.exe").reason).toMatch(/Disguised/);
    expect(analyzeAttachment("Secure_Message.html").level).toBe("high");
    expect(analyzeAttachment("invoice.xlsm").level).toBe("high");
    expect(analyzeAttachment("w2.pdf").level).toBe("low");
  });

  it("spots requests for passwords and login codes", () => {
    const x = extractRequest(
      "[TRAINING SAMPLE] Your client portal is locked. Verify your account and enter the 6-digit code we sent: https://maple-street-taxdocs.co/verify",
      "Maple Street Tax <alerts@maple-street-taxdocs.co>",
    );
    expect(x.isCredentialRequest).toBe(true);
    expect(x.credentialAsks).toEqual(expect.arrayContaining(["account_verification", "login_code"]));
    expect(extractRequest("Thanks, I reset my password yesterday.", "Sam <sam@example.com>").isCredentialRequest).toBe(false);
  });
});
