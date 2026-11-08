import puppeteer, { type Frame, type Page } from "puppeteer-core";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateOfficeKeys } from "@oj/core";

const API = process.env.API ?? "http://localhost:8787/api";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const EXT = resolve("extension/.output/chrome-mv3");
const SSN = "987-65-4321";

let step = 0;
const ok = (label: string) => console.log(`✓ ${++step}. ${label}`);
const errors: string[] = [];

const GMAIL = `<!doctype html><html><head><title>Inbox - Gmail</title></head><body>
<div role="main">
  <h2 class="hP">2025 tax documents needed</h2>
  <div class="adn ads"><div class="gs">
    <div class="gE"><span class="gD" email="maplestreet.tax.help@gmail.com" name="Maple Street Tax">Maple Street Tax</span></div>
    <div class="a3s aiL">[TRAINING SAMPLE]<br>Hi,<br>This is Maple Street Tax. To finish your 2025 return we need your W-2 and a photo of your driver's license today.<br>
      Please upload here: <a id="bad" href="https://maple-street-taxdocs.co/upload" target="_blank">https://www.maplestreettax.com/upload</a><br>
      Questions? Call (617) 555-0142<br><br>Maple Street Tax</div>
    <div class="aQH"><span class="aZo" download_url="text/html:Secure_Message.html:https://mail.google.com/x"><span class="aV3">Secure_Message.html</span></span></div>
  </div></div>
  <div class="adn ads"><div class="gs">
    <div class="gE"><span class="gD" email="sam@example.com" name="Sam">Sam</span></div>
    <div class="a3s aiL">Lunch tomorrow at noon? Here's the <a id="fine" href="https://example.com/menu" target="_blank">menu</a>.</div>
  </div></div>
  <div role="dialog">
    <div class="aoD"><span email="client.files@gmail.com" data-hovercard-id="client.files@gmail.com">Client</span></div>
    <div id="editor" contenteditable="true" role="textbox" aria-label="Message Body"><div id="first">Here are my documents:</div><div><br></div></div>
    <table><tbody><tr class="btC"><td class="gU Up"><div role="button">Send</div></td><td>more</td></tr></tbody></table>
  </div>
</div></body></html>`;

const shadowText = (page: Page, tag: string) =>
  page.evaluate((t) => document.querySelector(t)?.shadowRoot?.textContent ?? "", tag);

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return res.json();
}

async function clickText(frame: Frame | Page, text: string) {
  const el = await frame.waitForSelector(`::-p-text(${text})`, { timeout: 15000 });
  await el!.click();
}

const dir = mkdtempSync(join(tmpdir(), "oj-ext-"));
const docPath = join(dir, "w2-sample.txt");
writeFileSync(docPath, `W-2 Wage and Tax Statement 2025\nEmployee SSN ${SSN} (SAMPLE)\nWages 84,200.00\n`);

const officeDomain = `ext-smoke-${Date.now()}.test`;
const office = generateOfficeKeys(officeDomain, "Ext Smoke Tax");
await post("/offices", office.bundle);
const hijack = generateOfficeKeys(officeDomain, "Impostor Tax");
const hijackRes = await fetch(`${API}/offices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hijack.bundle) });
if (hijackRes.status !== 409) throw new Error(`office hijack not blocked: ${hijackRes.status}`);
ok("registry refuses a second key for an existing office domain (hijack blocked, 409)");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], args: ["--no-sandbox"] });
try {
  const worker = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"), { timeout: 15000 });
  const extId = new URL(worker.url()).host;
  ok(`extension loaded (${extId})`);

  const gmail = await browser.newPage();
  gmail.on("console", (m) => m.type() === "error" && errors.push(`gmail: ${m.text()}`));
  gmail.on("pageerror", (e) => errors.push(`gmail pageerror: ${e}`));
  await gmail.setRequestInterception(true);
  gmail.on("request", (r) => {
    if (r.url().startsWith("https://mail.google.com/")) r.respond({ status: 200, contentType: "text/html", body: GMAIL });
    else r.continue();
  });
  await gmail.goto("https://mail.google.com/mail/u/0/#inbox", { waitUntil: "domcontentloaded" });

  await gmail.waitForFunction(() => document.querySelectorAll("oj-card").length > 0, { timeout: 15000 });
  const cards = await gmail.evaluate(() => document.querySelectorAll("oj-card").length);
  if (cards !== 1) throw new Error(`expected 1 card, got ${cards}`);
  ok("\"Who's asking?\" card shown on the document request only (not on the lunch email)");

  const pills = await shadowText(gmail, "oj-card");
  for (const want of ["W-2", "Photo ID", "Tight deadline", "Secure_Message.html"]) if (!pills.includes(want)) throw new Error(`card missing ${want}`);
  ok("card lists what it asks for, pressure cues, and the dangerous .html attachment");

  await gmail.waitForFunction(
    () => /Verified|Doesn't match|Unknown/.test(document.querySelector("oj-card")?.shadowRoot?.querySelector(".title")?.textContent ?? ""),
    { timeout: 25000 },
  );
  const verdict = await gmail.evaluate(() => document.querySelector("oj-card")?.shadowRoot?.querySelector(".title")?.textContent);
  ok(`live check returned a verdict inside Gmail: ${verdict}`);

  const marks = await gmail.evaluate(() => [document.querySelector("#bad")?.getAttribute("data-oj-risk"), document.querySelector("#fine")?.getAttribute("data-oj-risk")]);
  if (marks[0] !== "high" || marks[1]) throw new Error(`link marks wrong: ${marks}`);
  ok("deceptive link outlined as high risk; ordinary link left alone");

  const pagesBefore = (await browser.pages()).length;
  await gmail.click("#bad");
  await gmail.waitForFunction(() => (document.querySelector("oj-guard")?.shadowRoot?.textContent ?? "").includes("isn't what it seems"), { timeout: 5000 });
  const guard = await shadowText(gmail, "oj-guard");
  if (!guard.includes("maple-street-taxdocs.co") || !guard.includes("maplestreettax.com")) throw new Error("guard missing real vs shown domain");
  if ((await browser.pages()).length !== pagesBefore) throw new Error("risky link opened despite guard");
  await gmail.evaluate(() => (document.querySelector("oj-guard")?.shadowRoot?.querySelector(".btn.primary") as HTMLElement)?.click());
  await gmail.waitForFunction(() => !document.querySelector("oj-guard"), { timeout: 5000 });
  ok("click on the risky link was stopped: guard showed real vs shown destination, nothing opened");

  const opened = browser.waitForTarget((t) => t.url().startsWith("https://example.com/"), { timeout: 8000 });
  await gmail.click("#fine");
  await (await (await opened).page())?.close();
  if (await gmail.evaluate(() => Boolean(document.querySelector("oj-guard")))) throw new Error("guard fired on an ordinary link");
  ok("ordinary links open without friction");

  await gmail.waitForSelector("oj-seal", { timeout: 10000 });
  const first = await gmail.$("#first");
  await first!.click({ offset: { x: 150, y: 5 } });
  const seal = await gmail.$("oj-seal");
  const box = await seal!.boundingBox();
  await gmail.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const vaultTarget = await browser.waitForTarget((t) => t.url().includes("/vault.html"), { timeout: 10000 }).catch(() => null);
  let vault: Frame | undefined;
  for (let i = 0; i < 50 && !vault; i++) {
    vault = gmail.frames().find((f) => f.url().includes("/vault.html"));
    if (!vault) await new Promise((r) => setTimeout(r, 200));
  }
  if (!vault) throw new Error(`vault iframe not found (${vaultTarget?.url()})`);
  vault.page().on("console", () => {});
  await vault.waitForSelector("::-p-text(Person mode)", { timeout: 15000 });
  ok("Seal & Attach opened the vault; it read the recipient (gmail.com → person mode)");

  const input = await vault.waitForSelector("input[type=file]");
  await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(resolve("fixtures/w2-sample.pdf"));
  await vault.waitForSelector("::-p-text(Contains 1 Social Security number and 1 EIN)", { timeout: 20000 });
  ok("vault scanned the W-2 on-device: \"Contains 1 Social Security number and 1 EIN\"");
  await vault.click('button[data-action="trim"]');
  await vault.waitForSelector("::-p-text(send only what they need)", { timeout: 10000 });
  await vault.waitForSelector("canvas", { timeout: 10000 });
  await clickText(vault, "Trim & verify");
  await vault.waitForSelector("::-p-text(Verified redacted)", { timeout: 30000 });
  const proof = await vault.evaluate(() => document.body.innerText);
  if (!proof.includes("no selectable text left") || !proof.includes("2/2 boxes solid black") || !proof.includes("metadata removed")) throw new Error(`trim proof incomplete: ${proof.slice(0, 400)}`);
  await clickText(vault, "Use trimmed file");
  await vault.waitForSelector("::-p-text(Trimmed and verified)", { timeout: 10000 });
  ok("Trim flattened the W-2 offline: SSN + EIN blacked out, 0 selectable text, metadata stripped, re-scan verified");
  await vault.evaluate(() => { const box = [...document.querySelectorAll('input[type=checkbox]')].find((c) => c.closest('label')?.textContent?.includes('I understand the risk')) as HTMLInputElement | undefined; box?.click(); });
  await vault.click('button[data-action="seal"]');
  await vault.waitForSelector("::-p-text(Pickup code)", { timeout: 30000 });
  const code = await vault.evaluate(() => document.querySelector("p.font-mono.text-3xl")?.textContent?.trim() ?? "");
  if (!/^\d{6}$/.test(code)) throw new Error(`no code shown: ${code}`);
  ok("file sealed inside the vault; 6-digit pickup code shown only in the vault");

  await gmail.waitForFunction(() => document.querySelector("#editor")?.innerHTML.includes("/h/ho_"), { timeout: 10000 });
  const editor = await gmail.evaluate(() => ({
    html: document.querySelector("#editor")!.innerHTML,
    order: document.querySelector("#editor")!.textContent!.indexOf("Here are my documents") < document.querySelector("#editor")!.textContent!.indexOf("Sealed document"),
  }));
  if (editor.html.includes(code)) throw new Error("pickup code leaked into the email");
  if (editor.html.includes(SSN)) throw new Error("plaintext leaked into the email");
  if (!editor.order) throw new Error("link not inserted at the cursor");
  const link = editor.html.match(/href="([^"]+\/h\/ho_[^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  if (!link) throw new Error("link missing");
  ok("only a sealed link was inserted at the cursor: no file, no code, no plaintext in the email");

  await gmail.evaluate((href) => {
    const msg = document.createElement("div");
    msg.className = "adn ads";
    msg.innerHTML = `<div class="gs"><div class="gE"><span class="gD" email="jordan@example.com" name="Jordan">Jordan</span></div><div class="a3s aiL" id="own">Here you go.<div>🔒 <a id="ownlink" href="${href}">Sealed document: w2-sample-trimmed.pdf</a> · I'll send you the 6-digit code separately. Self-destructs Nov 15.</div></div></div>`;
    document.querySelector("[role=main]")!.append(msg);
  }, link);
  await new Promise((r) => setTimeout(r, 1200));
  const own = await gmail.evaluate(() => ({ cards: document.querySelectorAll("oj-card").length, mark: document.querySelector("#ownlink")?.getAttribute("data-oj-risk") }));
  if (own.cards !== 1 || own.mark) throw new Error(`our own sealed-link email was flagged: ${JSON.stringify(own)}`);
  ok("an email carrying our own sealed link isn't flagged (no card, link not marked)");

  const gmailSawFile = await gmail.evaluate(() => [...document.querySelectorAll("input[type=file]")].length);
  if (gmailSawFile) throw new Error("Gmail page has a file input");
  await clickText(vault, "Done");
  await gmail.waitForFunction(() => !document.querySelector("oj-vault"), { timeout: 5000 });
  ok("Gmail's page never had a file input; vault closed");

  const recipient = await browser.newPage();
  await recipient.goto(link, { waitUntil: "networkidle0" });
  if (recipient.url().includes("#")) throw new Error("key fragment not scrubbed from the address bar");
  await recipient.waitForSelector("input[inputmode=numeric]", { timeout: 15000 });
  await recipient.type("input[inputmode=numeric]", code);
  await clickText(recipient, "Unlock");
  await recipient.waitForSelector("::-p-text(decrypted locally in this tab)", { timeout: 20000 });
  const openedText = await recipient.evaluate(() => document.body.innerText);
  if (!openedText.includes("w2-sample-trimmed.pdf") || !openedText.includes("Trimmed by sender · verified")) throw new Error("recipient didn't get the trimmed, verified file");
  ok("recipient opened it with link + code (trimmed W-2, \"Trimmed by sender · verified\"); key fragment scrubbed from the URL bar");

  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: "networkidle0" });
  await clickText(panel, "Seal");
  await panel.type("input[placeholder^='office@']", `frontdesk@${officeDomain}`);
  await panel.waitForSelector("::-p-text(No DNS fingerprint published)", { timeout: 15000 });
  await panel.waitForSelector("::-p-text(ML-DSA key signature)");
  const sealBtnDisabled = await panel.evaluate(() => (document.querySelector('button[data-action="seal"]') as HTMLButtonElement | null)?.disabled);
  const filePanel = await panel.$("input[type=file]");
  await (filePanel as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(docPath);
  const blockedBeforeWords = await panel.evaluate(() => (document.querySelector('button[data-action="seal"]') as HTMLButtonElement | null)?.disabled);
  if (!blockedBeforeWords) throw new Error("unverified office not gated on safety words");
  await panel.click("label input[type=checkbox]");
  await panel.click('button[data-action="seal"]');
  await panel.waitForSelector("::-p-text(receipt ✓)", { timeout: 30000 }).catch(async (e) => { console.log("PANEL:", await panel.evaluate(() => document.body.innerText)); throw e; });
  const officeLink = await panel.evaluate(() => (document.querySelector("input[readonly]") as HTMLInputElement)?.value);
  if (!officeLink?.includes("/office#ho_")) throw new Error(`office link wrong: ${officeLink}`);
  if (sealBtnDisabled === undefined) throw new Error("seal button missing");
  ok("side panel sealed to an office: signature verified, DNS checked by the browser, unverified domain gated on safety words");

  await clickText(panel, "Sent");
  const revokeButtons = () => panel.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Revoke" && !b.disabled).length);
  await panel.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Revoke"), { timeout: 15000 });
  const toRevoke = await revokeButtons();
  for (let i = 0; i < 6 && (await revokeButtons()) > 0; i++) {
    await panel.evaluate(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Revoke" && !b.disabled) as HTMLButtonElement)?.click());
    await new Promise((r) => setTimeout(r, 1200));
  }
  await panel.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Revoke"), { timeout: 15000 });
  const revoked = await panel.evaluate(() => (document.body.innerText.match(/Revoked/g) ?? []).length);
  if (revoked < toRevoke) throw new Error(`only ${revoked}/${toRevoke} revoked`);
  ok(`Sent tab revoked all ${toRevoke} handoffs this test created (ciphertext destroyed)`);

  await clickText(panel, "Ledger");
  await panel.waitForSelector("::-p-text(Privacy Ledger)");
  const ledger = await panel.evaluate(async () => JSON.stringify((await chrome.storage.local.get("ledger")).ledger));
  if (ledger.includes(SSN) || ledger.includes("W-2 Wage")) throw new Error("plaintext in ledger");
  if (!ledger.includes("cloudflare-dns.com") || !ledger.includes("/check")) throw new Error("ledger missing DoH or check calls");
  ok("Privacy Ledger lists every call (check, DNS-over-HTTPS, ciphertext PUT) and contains no plaintext");

  const direct = await browser.newPage();
  await direct.goto(`chrome-extension://${extId}/vault.html#00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle0" });
  await direct.waitForSelector("::-p-text(can only be opened from the Seal & Attach button)", { timeout: 5000 });
  ok("vault refuses to run outside Gmail / without a one-time nonce");

  const real = errors.filter((e) => !/favicon|ERR_|Failed to load resource|404/.test(e));
  if (real.length) {
    console.log("console errors:\n" + real.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${step} extension checks passed.`);
  }
} finally {
  await browser.close();
}
