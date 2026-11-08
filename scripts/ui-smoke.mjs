import puppeteer from "puppeteer-core";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP = process.env.APP ?? "http://localhost:5173";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const errors = [];
let step = 0;
const ok = (label) => console.log(`✓ ${++step}. ${label}`);
const text = (t) => `::-p-text(${t})`;

const dir = mkdtempSync(join(tmpdir(), "oj-ui-"));
const docPath = join(dir, "w2-sample.txt");
writeFileSync(docPath, "W-2 Wage and Tax Statement 2025\nEmployee SSN 987-65-4321\nWages 84,200.00\n");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const office = await browser.newPage();
  office.on("console", (m) => m.type() === "error" && errors.push(`office: ${m.text()}`));
  await office.goto(`${APP}/office`, { waitUntil: "networkidle0" });
  const inputs = await office.$$("input:not([type=file])");
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type("UI Smoke Tax");
  await inputs[1].type(`ui-smoke-${Date.now()}.test`);
  await inputs[2].type("may the force be with you");
  await inputs[3].type("may the force be with you");
  await office.click(text("Generate keys & register"));
  await office.waitForSelector(text("Sealed inbox"), { timeout: 30000 });
  ok("office generated PQ keys in-browser, registered, and signed in");

  await office.click(text("Create request link"));
  await office.waitForSelector(text("Latest request link"), { timeout: 15000 });
  const link = await office.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.textContent.trim()).find((t) => t.includes("/r/rq_")));
  ok(`request link created ${link.replace(/.*\/r\//, "/r/")}`);

  const client = await browser.newPage();
  client.on("console", (m) => m.type() === "error" && errors.push(`client: ${m.text()}`));
  await client.goto(link, { waitUntil: "networkidle0" });
  await client.waitForSelector(text("Office key signature valid"), { timeout: 15000 });
  ok("client page verified the office's ML-DSA bundle signature locally");

  const file = await client.$("input[type=file]");
  await file.uploadFile(docPath);
  await client.click(text("Seal & send"));
  await client.waitForSelector(text("receipt verified"), { timeout: 30000 });
  ok("client sealed + uploaded; server receipt verified in the browser");

  const ledgerHasPlaintext = await client.evaluate(() => document.body.innerText.includes("987-65-4321"));
  if (ledgerHasPlaintext) throw new Error("plaintext SSN visible in client ledger");
  ok("privacy ledger shows no plaintext SSN");

  await office.bringToFront();
  await office.waitForSelector(text("Decrypt"), { timeout: 15000 });
  await office.click(`button${text("Decrypt")}`);
  await office.waitForSelector(text("decrypted locally in this tab"), { timeout: 30000 });
  const shown = await office.evaluate(() => document.body.innerText.includes("987-65-4321"));
  if (!shown) throw new Error("decrypted content not shown");
  ok("office decrypted in-tab and sees the document");
  await office.click(text("Close"));

  await client.bringToFront();
  await client.waitForSelector(text("Opened"), { timeout: 15000 });
  ok("sender sees 'Opened' via the office's signed receipt");
  await client.click(`button${text("Revoke")}`);
  await client.waitForSelector(text("Revoked by sender"), { timeout: 15000 });
  await office.bringToFront();
  await office.waitForSelector(text("Revoked by sender"), { timeout: 15000 });
  ok("sender revoked; office inbox flipped to 'Revoked by sender' live");

  const checker = await browser.newPage();
  checker.on("console", (m) => m.type() === "error" && errors.push(`check: ${m.text()}`));
  await checker.goto(`${APP}/check`, { waitUntil: "networkidle0" });
  await checker.click(text("Load training sample"));
  await checker.waitForSelector(text("Asks for sensitive documents"), { timeout: 5000 });
  ok("check page parsed the training sample on-device (items + pressure cues)");
  await checker.click(`button${text("Check who's asking")}`);
  await checker.waitForSelector("::-p-xpath(//p[normalize-space()='Verified' or normalize-space()=\"Doesn't match\" or normalize-space()='Unknown'])", { timeout: 20000 });
  const verdict = await checker.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.textContent.trim()).find((t) => ["Verified", "Doesn't match", "Unknown"].includes(t)));
  ok(`check returned a verdict in the UI: ${verdict}`);

  const relevant = errors.filter((e) => !e.includes("favicon"));
  if (relevant.length) console.log("console errors:\n" + relevant.join("\n"));
  console.log(`\nUI smoke passed · ${step} steps`);
} catch (e) {
  console.error(`✗ step ${step + 1} failed: ${e.message}`);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
