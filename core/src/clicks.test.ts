import { describe, expect, it } from "vitest";
import { BAIT, downloadDecoys, gapTo, isDismissLabel, isSamePageHref, judgeElement, judgeOpen, navTargetInCode, nearestTrap, siteOf, urlsInHandler } from "./clicks";

const page = "https://free-movies.example/watch/42";
const click = (over: Partial<Parameters<typeof judgeOpen>[2] & object> = {}) => ({ label: "", hints: "", looksClickable: true, overlay: false, ...over });

describe("click guard rules (on-device)", () => {
  it("knows which site a URL belongs to", () => {
    expect(siteOf("https://www.news.bbc.co.uk/a")).toBe("bbc.co.uk");
    expect(siteOf("https://cdn.popads.example/x")).toBe("popads.example");
    expect(siteOf("evil.github.io")).toBe("evil.github.io");
  });

  it("recognizes close / cancel / no-thanks controls, including icon-only ones", () => {
    for (const l of ["✕", "×", "X", "Close", "Close ad", "No thanks", "No, thanks!", "Not now", "Skip Ad »", "Cancel", "Maybe later"]) expect(isDismissLabel(l)).toBe(true);
    expect(isDismissLabel("", "btn modal-close")).toBe(true);
    for (const l of ["Download", "Sign in with Google", "Read the closing statement in full here", "Continue to checkout"]) expect(isDismissLabel(l)).toBe(false);
  });

  it("blocks pop-ups that don't match what was clicked", () => {
    expect(judgeOpen("https://popads.example/x", page, click({ label: "✕" })).block).toBe(true);
    expect(judgeOpen("https://ads.example/pop", page, click({ label: "Download", anchorHref: "https://free-movies.example/file.zip" })).reason).toMatch(/also tried to open ads\.example/);
    expect(judgeOpen("https://pop.example/x", page, click({ label: "Plain article text", looksClickable: false })).block).toBe(true);
    expect(judgeOpen("https://clickjack.example/", page, click({ overlay: true })).block).toBe(true);
  });

  it("lets ordinary navigation through", () => {
    expect(judgeOpen("https://accounts.idp.example/login", page, click({ label: "Sign in with ExampleID" })).block).toBe(false);
    expect(judgeOpen("https://partner.example/", page, click({ label: "Visit our partner", anchorHref: "https://partner.example/" })).block).toBe(false);
    expect(judgeOpen("https://free-movies.example/next", page, click({ label: "✕" })).block).toBe(false);
    expect(judgeOpen("https://popads.example/x", page, null).block).toBe(false);
  });

  it("judges links and buttons before they're clicked", () => {
    expect(judgeElement({ label: "✕", hints: "modal-close", href: "https://popads.example/landing", handlerUrls: [], overlay: false }, page).level).toBe("high");
    expect(judgeElement({ label: "No thanks", hints: "", handlerUrls: urlsInHandler("location.href='https://offers.example/win'"), overlay: false }, page).reason).toMatch(/offers\.example/);
    expect(judgeElement({ label: "www.free-movies.example", hints: "", href: "https://phish.example/", handlerUrls: [], overlay: false }, page).reason).toMatch(/Shows free-movies\.example/);
    expect(judgeElement({ label: "", hints: "", href: "https://clickjack.example/", handlerUrls: [], overlay: true }, page).level).toBe("high");
    expect(judgeElement({ label: "Visit our partner", hints: "", href: "https://partner.example/", handlerUrls: [], overlay: false }, page).level).toBe("none");
    expect(judgeElement({ label: "Cancel", hints: "", href: "https://free-movies.example/account", handlerUrls: [], overlay: false }, page).level).toBe("none");
    expect(judgeElement({ label: "Sign in with ExampleID", hints: "", handlerUrls: ["https://accounts.idp.example/login"], overlay: false }, page).level).toBe("none");
    expect(judgeElement({ label: "Download", hints: "", href: "https://free-movies.example/f.zip", handlerUrls: ["https://ads.example/pop"], overlay: false }, page).reason).toMatch(/also opens ads\.example/);
  });

  it("spots clusters of fake download buttons", () => {
    const items = [
      { label: "Download", href: "https://free-movies.example/files/movie.zip" },
      { label: "DOWNLOAD NOW", href: "https://dl-ads.example/get" },
      { label: "Free download", href: "https://fast-dl.example/now" },
      { label: "About us", href: "https://free-movies.example/about" },
    ];
    expect([...downloadDecoys(items, page)]).toEqual([1, 2]);
    expect(downloadDecoys(items.slice(0, 1), page).size).toBe(0);
  });

  it("tags each finding with a kind the warning can explain", () => {
    expect(judgeElement({ label: "✕", hints: "", href: "https://popads.example/landing", handlerUrls: [], overlay: false }, page).kind).toBe("dismiss");
    expect(judgeElement({ label: "", hints: "", handlerUrls: ["https://clickjack.example/"], overlay: true }, page).kind).toBe("overlay");
    expect(judgeElement({ label: "Download", hints: "", href: "https://free-movies.example/f.zip", handlerUrls: ["https://ads.example/pop"], overlay: false }, page).kind).toBe("extra");
  });

  it("reads where a click handler navigates, but not URLs it only mentions", () => {
    expect(navTargetInCode(`() => { const w = window.open("https://ads.example/pop?src=1", "_blank"); }`)).toBe("https://ads.example/pop?src=1");
    expect(navTargetInCode(`function(){ location.href = 'https://offers.example/win' }`)).toBe("https://offers.example/win");
    expect(navTargetInCode(`e => window.location.assign(\`https://go.example/x\`)`)).toBe("https://go.example/x");
    expect(navTargetInCode(`() => fetch("https://analytics.example/close")`)).toBeNull();
    expect(isSamePageHref("#download")).toBe(true);
    expect(isSamePageHref("javascript:void(0)")).toBe(true);
    expect(isSamePageHref("/files/movie.zip")).toBe(false);
  });

  it("finds the trap closest to the pointer, preferring small buttons over page-wide layers", () => {
    const close = { box: { left: 100, top: 100, right: 120, bottom: 120 }, big: false };
    const cancel = { box: { left: 300, top: 100, right: 360, bottom: 130 }, big: false };
    const layer = { box: { left: 0, top: 0, right: 800, bottom: 600 }, big: true };
    expect(gapTo(close.box, 110, 110)).toBe(0);
    expect(gapTo(close.box, 150, 160)).toBe(50);
    expect(nearestTrap([close, cancel], 140, 110, 56)).toBe(close);
    expect(nearestTrap([close, cancel], 200, 300, 56)).toBeNull();
    expect(nearestTrap([close, cancel, layer], 130, 115, 56)).toBe(close);
    expect(nearestTrap([close, cancel, layer], 600, 500, 56)).toBe(layer);
    expect(nearestTrap([close], 100, 186, 56)).toBeNull();
    expect(nearestTrap([close], 100, 186, 56, close)).toBe(close);
  });

  it("spots notification bait", () => {
    expect(BAIT.test("Click Allow to verify you are not a robot")).toBe(true);
    expect(BAIT.test("Press “Allow” to watch the video")).toBe(true);
    expect(BAIT.test("We allow returns within 30 days.")).toBe(false);
  });
});
