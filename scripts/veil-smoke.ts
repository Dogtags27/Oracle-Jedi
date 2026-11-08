import { resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EXT = process.env.OJ_EXT ?? resolve("extension/.output/chrome-mv3");
const MEET_KEY = "meet.google.com/abc-defg-hij";
const STRIPES = "background:repeating-linear-gradient(90deg,#000 0 12px,#fff 12px 24px)";

const WHATSAPP = `<!doctype html><html><head><title>WhatsApp</title><style>body{margin:0;height:100vh;display:flex}#side{width:38%}#main{flex:1;display:flex;flex-direction:column}</style></head><body>
<div id="side"><div id="pane-side" style="height:100vh;${STRIPES}"><div role="listitem"><span title="Hackathon team" dir="auto">Hackathon team</span></div></div></div>
<div id="main"><header><span title="Hackathon team" dir="auto">Hackathon team</span></header><div role="application" style="flex:1;${STRIPES}"><div role="row"><div class="copyable-text" data-pre-plain-text="[09:01] Alex: ">Demo at 9</div></div></div><footer>-</footer></div>
</body></html>`;

const MEET = `<!doctype html><html><head><title>Meet - abc-defg-hij</title></head><body><button id="present">Present now</button><script>
document.getElementById("present").onclick = async () => {
  try {
    window.stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const t = window.stream.getVideoTracks()[0];
    window.info = { surface: t.getSettings().displaySurface, kind: t.constructor.name };
  } catch (e) { window.shareError = String(e); }
  window.done = true;
};
window.measure = async () => {
  if (!window.v) { window.v = Object.assign(document.createElement("video"), { muted: true, srcObject: window.stream }); await window.v.play(); }
  await new Promise((r) => setTimeout(r, 900));
  const v = window.v, c = document.createElement("canvas");
  c.width = 320; c.height = Math.round((320 * v.videoHeight) / v.videoWidth);
  const x = c.getContext("2d"); x.drawImage(v, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const det = (a, b) => { let s = 0, n = 0; for (let y = Math.floor(c.height * 0.2); y < c.height * 0.45; y++) for (let i = Math.floor(c.width * a); i < c.width * b - 1; i++) { const p = (y * c.width + i) * 4; s += Math.abs(d[p] - d[p + 4]); n++; } return Math.round(s / n); };
  return { list: det(0.05, 0.3), chat: det(0.5, 0.95), w: v.videoWidth, h: v.videoHeight };
};
</script></body></html>`;

let step = 0;
const ok = (label: string) => console.log(`✓ ${++step}. ${label}`);

async function open(browser: Browser, url: string, html: string) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url() === url ? r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html }) : r.abort()));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  enableExtensions: [EXT],
  args: ["--no-sandbox", "--auto-select-tab-capture-source-by-title=WhatsApp"],
});
try {
  const worker = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
  const extId = new URL(worker.url()).host;
  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "networkidle0" });
  await panel.evaluate(() => chrome.storage.local.set({ "sheathe:settings": { privateView: true }, "sheathe:allow": {} }));

  const wa = await open(browser, "https://web.whatsapp.com/", WHATSAPP);
  const meet = await open(browser, `https://${MEET_KEY}`, MEET);
  await new Promise((r) => setTimeout(r, 800));
  await meet.bringToFront();
  await meet.click("#present");
  await meet.waitForFunction(() => (window as any).done, { polling: 200, timeout: 15000 });
  const info = await meet.evaluate(() => ({ info: (window as any).info, error: (window as any).shareError }));
  if (!info.info || info.info.surface !== "browser") throw new Error(`tab capture not available here: ${JSON.stringify(info)}`);
  if (info.info.kind !== "MediaStreamTrackGenerator") throw new Error(`Meet got the raw track (${info.info.kind}), not the veiled one`);
  ok("Meet presented the WhatsApp tab; Meet received Avaran's veiled video track, not the raw capture");

  await wa.waitForFunction(() => document.documentElement.getAttribute("data-oj-sheathe") === "off" && document.querySelector("oj-sheathe-pill"), { polling: 200, timeout: 8000 });
  const local = await wa.evaluate(() => getComputedStyle(document.querySelector("#pane-side")!).filter + "|" + getComputedStyle(document.querySelector("[role=application]")!).filter);
  if (local.includes("blur")) throw new Error(`WhatsApp is blurred locally: ${local}`);
  ok("on your screen WhatsApp stays sharp (no local blur), with a Private view pill");

  const veiled = await meet.evaluate(() => (window as any).measure());
  if (veiled.list > 12 || veiled.chat > 12) throw new Error(`meeting frames not veiled: ${JSON.stringify(veiled)}`);
  ok(`the meeting's frames are veiled: detail ${veiled.list} in the chat list and ${veiled.chat} in the chat (the same stripes score ~50 when visible), frame ${veiled.w}×${veiled.h}`);

  await panel.evaluate((k) => chrome.storage.local.set({ "sheathe:allow": { [k]: ["Hackathon team"] } }), MEET_KEY);
  await wa.waitForFunction(() => document.querySelector("#main")?.hasAttribute("data-oj-reveal"), { polling: 200, timeout: 5000 });
  const revealed = await meet.evaluate(() => (window as any).measure());
  if (revealed.chat < 40 || revealed.list > 12) throw new Error(`reveal wrong in the meeting's frames: ${JSON.stringify(revealed)}`);
  ok(`"Reveal this chat" opens a window in the veil: the meeting now sees the chat (detail ${revealed.chat}) while the chat list stays veiled (${revealed.list})`);

  await panel.evaluate(() => chrome.storage.local.set({ "sheathe:allow": {} }));
  const hidden = await meet.evaluate(() => (window as any).measure());
  if (hidden.chat > 12) throw new Error(`hide all didn't re-veil: ${JSON.stringify(hidden)}`);
  ok(`"Hide all" re-veils the chat for the meeting (detail ${hidden.chat})`);

  await meet.evaluate(() => (window as any).stream.getTracks().forEach((t: MediaStreamTrack) => t.stop()));
  await wa.waitForFunction(() => !document.querySelector("oj-sheathe-pill"), { polling: 200, timeout: 8000 });
  ok("Stop presenting ends the capture and the Private view pill goes away");
  console.log(`\nAll ${step} Private view checks passed.`);
} finally {
  await browser.close();
}
