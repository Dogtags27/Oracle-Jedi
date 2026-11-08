import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EXT = process.env.OJ_EXT ?? resolve("extension/.output/chrome-mv3");
const OUT = resolve("evals/results");
mkdirSync(OUT, { recursive: true });

const PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const MEET_KEY = "meet.google.com/abc-defg-hij";

const WHATSAPP = `<!doctype html><html><head><title>(3) WhatsApp</title></head><body>
<div id="app"><div id="side"><div id="pane-side"><div role="grid">
<div role="listitem" id="row-team"><img class="av" src="${PX}" width="40" height="40"><span title="&#x202a;Hackathon team&#x202c;" dir="auto">&#x202a;Hackathon team&#x202c;</span><span dir="ltr" class="pv">Slides are in the drive</span></div>
<div role="listitem" id="row-mom"><img class="av" src="${PX}" width="40" height="40"><span title="Mom" dir="auto">Mom</span><span dir="ltr" class="pv">Call me when you land</span></div>
<div role="listitem" id="row-riley"><img class="av" src="${PX}" width="40" height="40"><span title="Riley Sample" dir="auto">Riley Sample</span><span dir="ltr" class="pv">My SSN is 987-65-4321</span></div>
</div></div></div>
<div id="main"><header><img id="hdr-av" src="${PX}" width="40" height="40"><span title="Hackathon team" dir="auto">Hackathon team</span></header>
<div role="application">
<div role="row" id="m1"><div class="copyable-text" data-pre-plain-text="[09:01] Alex: "><span>Demo at 9 sharp</span></div></div>
<div role="row" id="m2"><div class="copyable-text" data-pre-plain-text="[09:02] Sam: "><span>Bring the sample W-2 printouts</span></div></div>
<div role="row" id="m3"><img id="photo" src="${PX}" width="120" height="80"></div>
</div>
<footer><div contenteditable="true" role="textbox" id="compose">typing something private</div></footer></div></div></body></html>`;

const GMAIL = `<!doctype html><html><head><title>Inbox (342) - jordan.sample@gmail.com - Gmail</title></head><body>
<div role="main"><table><tbody>
<tr class="zA" id="g1"><td><img class="ajn" src="${PX}" width="28" height="28"></td><td class="yX"><span class="yW"><span email="alex@example.com" class="zF">Alex Sample</span></span></td><td><span class="bog">Your W-2 is ready</span><span class="y2"> - Employee SSN 987-65-4321</span></td></tr>
<tr class="zA" id="g2"><td><img class="ajn" src="${PX}" width="28" height="28"></td><td class="yX"><span class="yW"><span email="riley@example.com" class="zF">Riley Sample</span></span></td><td><span class="bog">Dinner Friday?</span><span class="y2"> - Bring the kids</span></td></tr>
</tbody></table></div></body></html>`;

const MEET = `<!doctype html><html><head><title>Meet - abc-defg-hij</title></head><body>
<button id="present">Present now</button>
<script>
document.getElementById("present").onclick = async () => {
  window.armAt = performance.timeOrigin + performance.now();
  try {
    window.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, preferCurrentTab: true });
    window.surface = window.stream.getVideoTracks()[0].getSettings().displaySurface;
  } catch (e) { window.shareError = String(e); }
  window.done = true;
};
window.sim = (phase, extra) => window.postMessage(Object.assign({ __oj_sheathe: 1, phase, id: "sim-1" }, extra || {}), location.origin);
</script></body></html>`;

const PII = `<!doctype html><html><head><title>Account settings</title></head><body>
<p id="ssn">Taxpayer SSN 987-65-4325 on file.</p>
<table><tr><td>Account number</td><td id="acct">000123456789</td></tr><tr><td>Routing number</td><td id="rtn">011000015</td></tr></table>
<p id="card">Visa 4111 1111 1111 1111 exp 04/29</p>
<p id="mail">Contact riley.sample@example.com or (617) 555-0123</p>
<p id="dob">Date of birth: 04/12/1986</p>
<p id="order">Order #4815162342 shipped to zip 02115 on 11/04/2025</p>
<p id="ref">Reference 561172842</p>
<img id="avatar" src="${PX}" style="width:40px;height:40px;border-radius:50%">
<img id="banner" src="${PX}" style="width:300px;height:60px">
</body></html>`;

let step = 0;
const ok = (label: string) => console.log(`✓ ${++step}. ${label}`);
const results: Record<string, unknown> = {};
const external: string[] = [];

async function open(browser: Browser, url: string, html: string) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url() === url) return r.respond({ status: 200, contentType: "text/html", body: html });
    if (!r.url().startsWith("data:") && !r.url().endsWith("/favicon.ico")) external.push(r.url());
    r.abort();
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

const attr = (p: Page) => p.evaluate(() => document.documentElement.getAttribute("data-oj-sheathe"));
const waitAttr = (p: Page, v: string, timeout = 6000) =>
  p.waitForFunction((val) => document.documentElement.getAttribute("data-oj-sheathe") === val, { polling: 200, timeout }, v);
const blurred = (p: Page, sel: string) =>
  p.evaluate((s) => [...document.querySelectorAll(s)].map((el) => getComputedStyle(el).filter.includes("blur")), sel);
const allBlurred = async (p: Page, sel: string) => {
  const r = await blurred(p, sel);
  return r.length > 0 && r.every(Boolean);
};
const noneBlurred = async (p: Page, sel: string) => (await blurred(p, sel)).every((b) => !b);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  enableExtensions: [EXT],
  args: ["--no-sandbox", "--auto-accept-this-tab-capture", "--use-fake-ui-for-media-stream"],
});
try {
  const worker = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
  const extId = new URL(worker.url()).host;
  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "networkidle0" });
  const ledgerBefore = await panel.evaluate(async () => ((await chrome.storage.local.get("ledger")).ledger ?? []).length);
  const send = (msg: unknown) => panel.evaluate((m) => chrome.runtime.sendMessage(m), msg);
  const setStorage = (obj: unknown) => panel.evaluate((o) => chrome.storage.local.set(o as Record<string, unknown>), obj);

  const wa = await open(browser, "https://web.whatsapp.com/", WHATSAPP);
  const gm = await open(browser, "https://mail.google.com/mail/u/0/#inbox", GMAIL);
  const meet = await open(browser, `https://${MEET_KEY}`, MEET);
  await waitAttr(wa, "off");
  await waitAttr(gm, "off");
  if ((await wa.title()) !== "(3) WhatsApp" || !(await noneBlurred(wa, "#pane-side img, span[title], .copyable-text"))) throw new Error("shield on while not sharing");
  ok("not sharing: WhatsApp and Gmail untouched (no blur, real tab titles)");

  await wa.evaluate(() => {
    const w = window as unknown as { onAt?: number };
    new MutationObserver(() => {
      if (document.documentElement.getAttribute("data-oj-sheathe") === "on" && !w.onAt) w.onAt = performance.timeOrigin + performance.now();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-oj-sheathe"] });
  });
  await meet.bringToFront();
  await meet.click("#present");
  await meet.waitForFunction(() => (window as unknown as { done?: boolean }).done, { polling: 200, timeout: 15000 });
  const real = await meet.evaluate(() => ({ armAt: (window as any).armAt as number, surface: (window as any).surface as string | undefined, error: (window as any).shareError as string | undefined }));
  const onAt = await wa.waitForFunction(() => (window as unknown as { onAt?: number }).onAt, { polling: 200, timeout: 5000 }).then((h) => h.jsonValue() as Promise<number>).catch(() => 0);
  const armMs = onAt ? Math.round(onAt - real.armAt) : -1;
  results.armingMs = armMs;
  results.realPicker = real.surface ? `shared ${real.surface}` : `picker unavailable in headless (${real.error?.slice(0, 60)})`;
  if (!onAt) throw new Error("shield did not arm when the share picker opened");
  ok(`share picker opened → WhatsApp tab sheathed in ${armMs} ms, before any source was picked (${results.realPicker})`);
  if (real.surface === "monitor" || real.surface === "window") {
    await new Promise((r) => setTimeout(r, 600));
    if ((await attr(wa)) !== "on" || (await wa.title()) !== "WhatsApp") throw new Error("real screen share did not keep WhatsApp sheathed");
    ok(`real getDisplayMedia share of the ${real.surface === "monitor" ? "entire screen" : "window"} → WhatsApp stays sheathed, title masked`);
    const stopped = await meet.evaluate(() => {
      const s = (window as any).stream as MediaStream | undefined;
      s?.getTracks().forEach((t) => t.stop());
      return s ? s.getTracks().map((t) => t.readyState) : "no stream";
    });
    if (!Array.isArray(stopped)) throw new Error("no real stream to stop");
    await waitAttr(wa, "off", 8000);
    ok("Meet called track.stop() (\"Stop presenting\") → shield released after the grace period");
  } else if (real.surface === "browser") {
    await new Promise((r) => setTimeout(r, 600));
    if ((await attr(wa)) !== "on") throw new Error("a tab share released WhatsApp");
    await meet.evaluate(() => (window as any).stream?.getTracks().forEach((t: MediaStreamTrack) => t.stop()));
    await waitAttr(wa, "off", 8000);
    ok("Meet shared a tab → WhatsApp stays sheathed anyway (fails closed) until \"Stop presenting\", then released after the grace period");
  } else {
    await waitAttr(wa, "off", 8000);
    ok("share cancelled → shield dropped");
  }

  await meet.evaluate(() => (window as any).sim("arming"));
  await waitAttr(wa, "on");
  await meet.evaluate(() => (window as any).sim("on", { surface: "monitor", handle: null }));
  await wa.waitForFunction(() => document.title === "WhatsApp", { polling: 200, timeout: 5000 });
  const waChecks: [string, string][] = [
    ["avatars", "#pane-side img, #hdr-av"],
    ["names", "#pane-side span[title], #main header span[title]"],
    ["previews", ".pv"],
    ["messages", "#main > [role=application]"],
    ["media", "#photo"],
    ["input", "#compose"],
  ];
  let planted = 0;
  let hidden = 0;
  for (const [name, sel] of waChecks) {
    const r = await blurred(wa, sel);
    planted += r.length;
    hidden += r.filter(Boolean).length;
    if (!r.length || !r.every(Boolean)) throw new Error(`WhatsApp ${name} not blurred: ${JSON.stringify(r)}`);
  }
  const gmChecks = ["img.ajn", ".zF", ".bog", ".y2"];
  await gm.waitForFunction(() => document.title === "Gmail", { polling: 200, timeout: 5000 });
  for (const sel of gmChecks) {
    const r = await blurred(gm, sel);
    planted += r.length;
    hidden += r.filter(Boolean).length;
    if (!r.length || !r.every(Boolean)) throw new Error(`Gmail ${sel} not blurred`);
  }
  results.coverage = `${hidden}/${planted}`;
  if (!(await wa.$("oj-sheathe-pill"))) throw new Error("pill missing");
  ok(`entire-screen share: ${hidden}/${planted} sensitive elements blurred across WhatsApp and Gmail (avatars, names, previews, messages, media, typing); titles masked; pill shown`);

  const note = await wa.evaluate(() => {
    const n = new Notification("Mom", { body: "Call me when you land" });
    return [n.title, n.body];
  });
  if (note[0] !== "New WhatsApp message" || note[1].includes("Call me")) throw new Error(`notification not masked: ${note}`);
  ok("notifications masked while sheathed (\"New WhatsApp message\", no sender, no text)");

  await setStorage({ "sheathe:allow": { [MEET_KEY]: ["Hackathon team"] } });
  await wa.waitForFunction(() => document.querySelector("#main")?.hasAttribute("data-oj-reveal"), { polling: 200, timeout: 5000 });
  if (!(await noneBlurred(wa, "#main > [role=application], #m1 .copyable-text, #m2 .copyable-text, #row-team span[title], #row-team .pv, #row-team img"))) throw new Error("revealed chat still blurred");
  if (!(await allBlurred(wa, "#row-mom span[title], #row-mom img, #row-mom .pv, #row-riley .pv"))) throw new Error("other chats revealed");
  ok("\"Reveal this chat\" shows the Hackathon team chat and its name, picture and preview in the chat list (even with hidden text-direction marks); Mom and Riley stay sheathed");

  await wa.bringToFront();
  const switched = await wa.evaluate(
    () =>
      new Promise<{ revealed: boolean; blurred: boolean }>((resolve) => {
        const main = document.querySelector("#main")!;
        const name = main.querySelector("header span[title]")!;
        name.setAttribute("title", "Mom");
        name.textContent = "Mom";
        main.querySelector("#m1 span")!.textContent = "Call me when you land";
        requestAnimationFrame(() =>
          resolve({ revealed: main.hasAttribute("data-oj-reveal"), blurred: getComputedStyle(main.querySelector("[role=application]")!).filter.includes("blur") }),
        );
      }),
  );
  if (switched.revealed || !switched.blurred) throw new Error(`switching chats showed the new chat: ${JSON.stringify(switched)}`);
  await wa.evaluate(() => {
    const name = document.querySelector("#main header span[title]")!;
    name.setAttribute("title", "Hackathon team");
    name.textContent = "Hackathon team";
  });
  await wa.waitForFunction(() => document.querySelector("#main")?.hasAttribute("data-oj-reveal"), { polling: 200, timeout: 5000 });
  ok("switching from a revealed chat to a hidden one re-blurs before the next frame is painted (no flash of the new chat)");

  await setStorage({ "sheathe:allow": {} });
  await wa.waitForFunction(() => !document.querySelector("#main")?.hasAttribute("data-oj-reveal"), { polling: 200, timeout: 5000 });
  if (!(await allBlurred(wa, "#main > [role=application], #row-team span[title], #row-team img, #row-team .pv"))) throw new Error("hide all left a chat visible");
  ok("\"Hide all revealed\" blurs every revealed chat again, in the chat and in the list");

  await setStorage({ "sheathe:settings": { lastN: 1 } });
  await wa.waitForFunction(() => document.querySelector("#m3")?.hasAttribute("data-oj-reveal"), { polling: 200, timeout: 5000 });
  if (!(await allBlurred(wa, "#m1 .copyable-text")) || !(await noneBlurred(wa, "#photo"))) throw new Error("last-N reveal wrong");
  await setStorage({ "sheathe:settings": { lastN: 0 } });
  ok("\"Keep last N messages visible\" reveals only the newest message");

  await wa.waitForFunction(() => getComputedStyle(document.querySelector("#main > [role=application]")!).filter.includes("blur"), { polling: 200, timeout: 5000 });
  const fresh = await wa.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const neo = document.createElement("div");
        neo.id = "main";
        neo.innerHTML = '<header><span title="Riley Sample" dir="auto">Riley Sample</span></header><div class="new-layout"><p>My SSN is 987-65-4321</p></div>';
        document.querySelector("#main")!.replaceWith(neo);
        requestAnimationFrame(() => resolve(getComputedStyle(neo.querySelector(".new-layout")!).filter.includes("blur")));
      }),
  );
  if (!fresh) throw new Error("a newly opened chat with an unknown layout was visible in its first frame");
  ok("a newly opened chat is blurred in its very first frame, even with a page layout Sheathe has never seen");

  await wa.evaluate(() => document.querySelectorAll("#pane-side [role]").forEach((el) => el.removeAttribute("role")));
  await wa.waitForFunction(() => document.querySelector("#pane-side")?.getAttribute("data-oj-layer") === "region", { polling: 200, timeout: 5000 });
  if (!(await allBlurred(wa, "#pane-side"))) throw new Error("region fallback not blurred");
  ok("fails closed: when the chat list's structure is unrecognized, the whole list is blurred");

  await meet.evaluate(() => (window as any).sim("on", { surface: "browser", handle: null }));
  await new Promise((r) => setTimeout(r, 600));
  if ((await attr(wa)) !== "on" || (await attr(gm)) !== "on") throw new Error("sharing another tab released the shield");
  ok("sharing some other tab → WhatsApp and Gmail stay sheathed anyway (fails closed if you switch the share to them)");

  await meet.evaluate(() => (window as any).sim("on", { surface: "window" }));
  await waitAttr(wa, "on");
  await meet.evaluate(() => (window as any).sim("off"));
  await new Promise((r) => setTimeout(r, 1500));
  if ((await attr(wa)) !== "on") throw new Error("grace period missing");
  await waitAttr(wa, "off", 6000);
  if ((await wa.title()) !== "(3) WhatsApp") throw new Error("title not restored");
  ok("share stopped → stays sheathed through a 3 s grace period, then restores everything including the tab title");

  await send({ type: "sheathe:set", mode: "manual" });
  await waitAttr(wa, "on");
  await meet.evaluate(() => {
    (window as any).sim("arming");
    (window as any).sim("off");
  });
  await new Promise((r) => setTimeout(r, 3800));
  if ((await attr(wa)) !== "on") throw new Error("page cleared a manual shield");
  await send({ type: "sheathe:set", mode: "panic" });
  await wa.waitForFunction(() => document.documentElement.hasAttribute("data-oj-panic"), { polling: 200, timeout: 5000 });
  if (!(await allBlurred(wa, "#app"))) throw new Error("panic did not blur everything");
  await send({ type: "sheathe:set", mode: "off" });
  await waitAttr(wa, "off");
  ok("manual on (Ctrl+Shift+9) can't be cleared by a page; panic (Ctrl+Shift+0) blurs everything; off restores");

  const pii = await open(browser, "http://localhost:8787/pii-fixture", PII);
  await panel.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost:8787/pii-fixture" });
    await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ["/sheathe-any.js"] });
  });
  await pii.waitForFunction(() => document.documentElement.getAttribute("data-oj-any") === "on", { polling: 200, timeout: 5000 });
  const piiResult = await pii.evaluate(() => {
    return {
      sensitive: ["ssn", "acct", "rtn", "card", "mail", "dob"].map((id) => [id, Boolean(document.getElementById(id)?.querySelector("[data-oj-pii]"))]),
      benign: ["order", "ref"].map((id) => [id, Boolean(document.getElementById(id)?.querySelector("[data-oj-pii]"))]),
      avatar: document.getElementById("avatar")!.hasAttribute("data-oj-pii-img"),
      banner: document.getElementById("banner")!.hasAttribute("data-oj-pii-img"),
      blurredSsn: getComputedStyle(document.querySelector("#ssn [data-oj-pii]")!).filter.includes("blur"),
      ssnTextKept: document.getElementById("ssn")!.textContent,
    };
  });
  const caught = piiResult.sensitive.filter(([, v]) => v).length;
  const falseHits = piiResult.benign.filter(([, v]) => v).length;
  results.anySite = { caught: `${caught}/${piiResult.sensitive.length}`, falseHits, avatar: piiResult.avatar, banner: piiResult.banner };
  if (caught !== piiResult.sensitive.length || falseHits || !piiResult.avatar || piiResult.banner || !piiResult.blurredSsn) throw new Error(`any-site sheathe wrong: ${JSON.stringify(piiResult)}`);
  await pii.keyboard.down("Alt");
  await pii.click("#order");
  await pii.keyboard.up("Alt");
  if (!(await pii.evaluate(() => document.getElementById("order")!.hasAttribute("data-oj-pii-manual")))) throw new Error("Alt+click didn't sheathe");
  ok(`"Sheathe this page" on any site: ${caught}/${piiResult.sensitive.length} sensitive values blurred (SSN, labelled account + routing, card, email/phone, DOB), 0 false hits on order/zip/reference numbers, round avatar blurred, banner left alone, Alt+click hides more`);

  const ledgerAfter = await panel.evaluate(async () => ((await chrome.storage.local.get("ledger")).ledger ?? []).length);
  if (external.length || ledgerAfter !== ledgerBefore) throw new Error(`Sheathe made network requests: ${external.join(", ")} (ledger ${ledgerBefore}→${ledgerAfter})`);
  results.networkRequests = 0;
  ok("zero network requests from Sheathe on every page, and nothing new in the Privacy Ledger");

  writeFileSync(
    resolve(OUT, "sheathe.md"),
    [
      "# Sheathe eval (screen-share privacy)",
      "",
      `Run ${new Date().toISOString()} in Chrome with the real extension. Fixtures are structure-only pages with fictional people.`,
      "",
      "| Metric | Result |",
      "|---|---|",
      `| Time from the share picker opening to another tab being sheathed | **${results.armingMs} ms** (before any source is picked) |`,
      `| Sensitive elements blurred during an entire-screen share (WhatsApp + Gmail) | **${results.coverage}** |`,
      "| Reveal precision | only the revealed chat is visible; other chats stay blurred |",
      "| Unrecognized page structure | whole region blurred (fails closed) |",
      `| "Sheathe this page" on any site | ${(results.anySite as { caught: string }).caught} sensitive values caught, ${(results.anySite as { falseHits: number }).falseHits} false hits |`,
      "| Network requests made by Sheathe | **0** |",
      `| Real share picker in this run | ${results.realPicker} |`,
      "",
    ].join("\n"),
  );
  console.log(`\nAll ${step} Sheathe checks passed.`);
} finally {
  await browser.close();
}
