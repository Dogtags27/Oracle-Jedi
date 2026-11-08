import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EXT = resolve(process.env.OJ_EXT ?? "extension/.output/chrome-mv3");
const OUT = resolve("evals/results");
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:8787";

const MOVIES = `<!doctype html><html><head><title>Free Movies (test fixture)</title></head><body style="font-family:sans-serif;font-size:16px">
<div id="modal" style="border:1px solid #ccc;padding:10px;width:420px">
<p>Join our newsletter?</p>
<a id="fakeClose" class="modal-close" href="https://popads.example/landing" style="display:inline-block;padding:4px 8px">✕</a>
<button id="realCancel" onclick="document.getElementById('modal').dataset.closed='1'">Cancel</button>
<button id="noThanks" onclick="location.href='https://offers.example/win'">No thanks</button>
</div>
<p><a id="dl1" href="/guard/files/movie.zip" onclick="window.open('https://ads.example/pop')">Download</a></p>
<p><a id="dl2" href="https://dl-ads.example/get">Download now</a> &nbsp; <a id="dl3" href="https://fast-dl.example/now">Free download</a></p>
<p><a id="partner" href="https://partner.example/" target="_blank">Visit our partner</a></p>
<p><a id="selfClose" href="#">Close</a></p>
<p><button id="signin" onclick="window.open('https://accounts.idp.example/login')">Sign in with ExampleID</button></p>
<p id="plain">Plain article text about movies. Nothing to click here.</p>
<form id="survey" action="https://collect.example/submit" method="post"><input name="q" value="x"><button id="surveyCancel" type="submit">Cancel</button> <button id="surveySend" type="submit">Send survey</button></form>
<p id="bait">Click Allow to verify you are not a robot</p>
<button id="allowBtn" onclick="Notification.requestPermission().then(function (r) { window.permResult = r; })">Continue</button>
<script>document.getElementById('plain').addEventListener('click', function () { window.open('https://pop.example/x'); });</script>
</body></html>`;

const OVERLAY = `<!doctype html><html><head><title>Story (test fixture)</title></head><body style="font-family:sans-serif">
<p id="article" style="font-size:22px;margin:60px 40px">Read the full story below.</p>
<a id="overlay" href="https://clickjack.example/" style="position:fixed;left:0;top:0;width:100vw;height:100vh;opacity:0;z-index:9"></a>
<iframe id="ghost" src="https://ads-frame.example/" style="position:fixed;left:0;top:220px;width:640px;height:320px;opacity:0.01;border:0;z-index:8"></iframe>
</body></html>`;

const LATE = `<!doctype html><html><head><title>Late (test fixture)</title></head><body>
<div><p>Allow cookies?</p><a id="lateClose" href="https://tracker-ads.example/" class="close-btn">×</a></div></body></html>`;

let step = 0;
const ok = (label: string) => console.log(`✓ ${++step}. ${label}`);
const requests: string[] = [];
const opened: string[] = [];

async function open(page: Page, path: string, html: string) {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const url = r.url();
    if (url === `${BASE}${path}`) return r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    if (url.startsWith("data:")) return r.continue();
    if (!url.endsWith("/favicon.ico")) requests.push(url);
    r.respond({ status: 204, body: "" });
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
}

const axText = async (page: Page) => JSON.stringify(await page.accessibility.snapshot({ interestingOnly: false }));
const waitAx = async (page: Page, needle: string, timeout = 6000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if ((await axText(page)).includes(needle)) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`UI never showed: ${needle}`);
};
const pressAx = async (page: Page, name: string) => {
  const button = await page.waitForSelector(`::-p-aria([name="${name}"][role="button"])`, { timeout: 5000 });
  await button!.click();
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hit = (needle: string) => requests.some((u) => u.includes(needle));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], args: ["--no-sandbox"] });
browser.on("targetcreated", (t) => opened.push(t.url()));
try {
  const worker = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
  const extId = new URL(worker.url()).host;
  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "networkidle0" });
  const ledgerBefore = await panel.evaluate(async () => ((await chrome.storage.local.get("ledger")).ledger ?? []).length);
  const enabled = await panel.evaluate(() => chrome.runtime.sendMessage({ type: "guard:enable", matches: ["http://localhost:8787/guard/*"] }));
  if (!enabled?.ok) throw new Error(`enable failed: ${JSON.stringify(enabled)}`);
  ok("Click Guard registered through the same path as \"Guard every site\" (scoped to the test path)");

  const page = await browser.newPage();
  await open(page, "/guard/movies", MOVIES);
  await page.waitForFunction(() => document.querySelectorAll("[data-oj-click]").length >= 5, { polling: 200, timeout: 8000 });
  const marks = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[id]")].map((e) => [e.id, e.getAttribute("data-oj-click") ?? ""])));
  const deceptive = ["fakeClose", "noThanks", "dl1", "dl2", "dl3", "surveyCancel"];
  const benign = ["realCancel", "partner", "selfClose", "signin", "surveySend", "allowBtn"];
  const flagged = deceptive.filter((id) => marks[id]);
  const falseFlags = benign.filter((id) => marks[id]);
  if (flagged.length !== deceptive.length || falseFlags.length) throw new Error(`marks wrong: ${JSON.stringify(marks)}`);
  if (marks.fakeClose !== "high" || marks.noThanks !== "high" || marks.surveyCancel !== "high") throw new Error(`levels wrong: ${JSON.stringify(marks)}`);
  await pressAx(page, "Show where they go");
  await waitAx(page, "popads.example");
  await pressAx(page, "Hide");
  ok(`page scan before any click: ${flagged.length}/${deceptive.length} deceptive controls outlined (fake ✕, "No thanks" with a hidden redirect, download with a pop-up, 2 decoy downloads, "Cancel" that posts the form elsewhere), 0/${benign.length} false flags; the pill lists where each one goes`);

  const box = async (sel: string) => (await page.$eval(sel, (e) => e.getBoundingClientRect().toJSON())) as { left: number; top: number; width: number; height: number };
  const close = await box("#fakeClose");
  await page.mouse.move(close.left + close.width / 2, close.top - 22, { steps: 4 });
  await waitAx(page, "A fake way out");
  await waitAx(page, "popads.example");
  if (hit("popads.example") || (await axText(page)).includes("Stop: that's not")) throw new Error("proximity warning clicked or opened something");
  ok("pointer 22 px from the fake “✕”, no click: Avaran outlines its real click area and says it goes to popads.example");

  const signin = await box("#signin");
  await page.mouse.move(signin.left + signin.width / 2, signin.top + signin.height / 2, { steps: 6 });
  await sleep(500);
  const quietAx = (await axText(page)).toLowerCase();
  if (quietAx.includes("before you click") || quietAx.includes("a fake way out")) throw new Error("warning near a normal control");
  ok("pointer on a normal control (“Sign in”): no warning, and the earlier one is gone");

  await page.click("#fakeClose");
  await waitAx(page, "Stop: that's not where this button should go");
  await waitAx(page, "popads.example");
  await pressAx(page, "Stay on this page");
  if (hit("popads.example")) throw new Error("fake close navigated");
  ok("fake “✕” link stopped: dialog shows it really goes to popads.example; staying keeps you on the page");

  await page.click("#noThanks");
  await waitAx(page, "offers.example");
  await pressAx(page, "Stay on this page");
  await sleep(300);
  if (hit("offers.example")) throw new Error("No thanks redirect happened");
  ok("“No thanks” button's scripted redirect (location.href) cancelled via the Navigation API before it left the page");

  await page.click("#dl1");
  await waitAx(page, "Blocked a hidden pop-up");
  await waitAx(page, "ads.example");
  await sleep(400);
  if (!hit("/guard/files/movie.zip")) throw new Error("real download didn't proceed");
  if (opened.some((u) => u.includes("ads.example/pop"))) throw new Error("pop-under opened");
  await pressAx(page, "OK");
  ok("real “Download” still downloads, but the pop-under it tried to open (ads.example) was blocked");

  await page.click("#plain");
  await waitAx(page, "pop.example");
  await sleep(300);
  if (opened.some((u) => u.includes("pop.example"))) throw new Error("click-anywhere pop-up opened");
  await pressAx(page, "OK");
  ok("clicking ordinary text that tried to open pop.example: blocked");

  await page.click("#surveyCancel");
  await waitAx(page, "collect.example");
  await pressAx(page, "Stay on this page");
  await sleep(300);
  if (hit("collect.example")) throw new Error("cancel submitted the form");
  ok("“Cancel” that would have posted the form to collect.example: stopped");

  await page.click("#allowBtn");
  await page.waitForFunction(() => (window as unknown as { permResult?: string }).permResult === "default", { polling: 200, timeout: 5000 });
  await waitAx(page, "Blocked a notification trick");
  await pressAx(page, "OK");
  ok("“Click Allow to prove you're not a robot” trap: permission request answered “not allowed” without a prompt");

  await page.click("#dl2");
  await waitAx(page, "Check before you go");
  await pressAx(page, "Go there anyway");
  await sleep(500);
  if (!hit("dl-ads.example")) throw new Error("user override didn't proceed");
  ok("decoy “Download now” to dl-ads.example asked first; “Go there anyway” respects the user's choice");

  const beforeBenign = opened.length;
  for (const id of ["#realCancel", "#selfClose", "#partner", "#signin"]) {
    await page.bringToFront();
    await page.click(id);
    await sleep(250);
  }
  await sleep(600);
  for (const p of await browser.pages()) if (/partner\.example|accounts\.idp\.example/.test(p.url()) || p.url() === "about:blank") await p.close().catch(() => {});
  await page.bringToFront();
  const surveyBefore = requests.filter((u) => u.includes("collect.example")).length;
  await page.click("#surveySend");
  await sleep(600);
  const modalClosed = await page.evaluate(() => document.getElementById("modal")?.dataset.closed === "1");
  const newTabs = opened.slice(beforeBenign).join(" ");
  if (!modalClosed || !newTabs.includes("partner.example") || !newTabs.includes("accounts.idp.example") || requests.filter((u) => u.includes("collect.example")).length <= surveyBefore) {
    throw new Error(`benign actions blocked: modal ${modalClosed}, tabs ${newTabs}`);
  }
  if ((await axText(page)).includes("Stop: that's not")) throw new Error("benign action raised a warning");
  ok("normal controls untouched: real Cancel, same-page Close, partner link, “Sign in” pop-up and a real form submit all work without a warning");

  const overlay = await browser.newPage();
  await open(overlay, "/guard/overlay", OVERLAY);
  await overlay.waitForFunction(() => document.getElementById("overlay")?.hasAttribute("data-oj-click-overlay"), { polling: 200, timeout: 8000 });
  const under = await overlay.evaluate(() => {
    const r = document.getElementById("article")!.getBoundingClientRect();
    return document.elementFromPoint(r.left + 20, r.top + r.height / 2)?.id;
  });
  const ghost = await overlay.evaluate(() => document.getElementById("ghost")?.getAttribute("data-oj-click"));
  const art = (await overlay.$eval("#article", (e) => e.getBoundingClientRect().toJSON())) as { left: number; top: number; height: number };
  await overlay.mouse.move(art.left + 20, art.top + art.height / 2, { steps: 4 });
  await waitAx(overlay, "Invisible click trap");
  await waitAx(overlay, "clickjack.example");
  await overlay.click("#article");
  await sleep(400);
  if (under !== "article" || ghost !== "high" || hit("clickjack.example")) throw new Error(`overlay not defused: under=${under} ghost=${ghost}`);
  ok("invisible full-page link (clickjack.example) and a near-transparent ad frame found and defused: hovering shows the trap's real size, clicks reach the real text");

  const late = await browser.newPage();
  await open(late, "/other/late", LATE);
  await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost:8787/other/late" });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ["/content-scripts/guard-hook.js"], world: "MAIN", injectImmediately: true });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ["/content-scripts/guard.js"], injectImmediately: true });
  });
  await late.waitForFunction(() => document.getElementById("lateClose")?.getAttribute("data-oj-click") === "high", { polling: 200, timeout: 6000 });
  await late.click("#lateClose");
  await waitAx(late, "tracker-ads.example");
  if (hit("tracker-ads.example")) throw new Error("late page fake close navigated");
  ok("“Check this page” (injected after load, like right-click / Alt+Shift+G) catches the fake “×” on a cookie banner");

  const log = await panel.evaluate(async () => ((await chrome.storage.local.get("guard:log"))["guard:log"] as { kind: string; dest: string }[]) ?? []);
  const kinds = new Set(log.map((e) => e.kind));
  for (const k of ["link", "redirect", "popup", "form", "notification"]) if (!kinds.has(k)) throw new Error(`log missing ${k}: ${JSON.stringify(log)}`);
  const ledgerAfter = await panel.evaluate(async () => ((await chrome.storage.local.get("ledger")).ledger ?? []).length);
  if (ledgerAfter !== ledgerBefore) throw new Error("Click Guard used the network");
  ok(`${log.length} blocks logged on this device only (links, redirects, pop-ups, forms, notification trap); 0 network requests from Click Guard`);

  await panel.evaluate(() => chrome.runtime.sendMessage({ type: "guard:disable" }));
  const after = await browser.newPage();
  await open(after, "/guard/movies", MOVIES);
  await sleep(1500);
  if (await after.$("oj-click-guard")) throw new Error("guard still running after disable");
  ok("turning Click Guard off unregisters it immediately");

  writeFileSync(
    resolve(OUT, "guard.md"),
    [
      "# Click Guard eval (deceptive buttons and links)",
      "",
      `Run ${new Date().toISOString()} in Chrome with the real extension, on test pages with fictional sites.`,
      "",
      "| Metric | Result |",
      "|---|---|",
      `| Deceptive controls flagged before any click | **${flagged.length}/${deceptive.length}** |`,
      `| Normal controls wrongly flagged | **${falseFlags.length}/${benign.length}** |`,
      "| Deceptive actions stopped at click time | 7/7 (fake ✕, scripted redirect, pop-under, click-anywhere pop-up, form “Cancel”, notification trap, late-injected cookie-banner ✕) |",
      "| Normal actions allowed without a warning | 5/5 (Cancel, same-page Close, partner link, sign-in pop-up, real form submit) |",
      "| Invisible overlays (link + frame) defused | 2/2 |",
      "| Warned before the click, from pointer distance alone | fake ✕ at 22 px, invisible overlay on hover; 0 warnings on a normal control |",
      "| Network requests made by Click Guard | **0** |",
      "",
    ].join("\n"),
  );
  console.log(`\nAll ${step} Click Guard checks passed.`);
} finally {
  await browser.close();
}
