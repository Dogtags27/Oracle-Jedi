import puppeteer from "puppeteer-core";
const dir = "C:/Users/hrida/AppData/Local/Temp/claude/0152d970c44c26d9/e8fa1d26-e34f-4969-880a-05526ab62a7e/scratchpad/ui/";
import { mkdirSync } from "node:fs"; mkdirSync(dir, { recursive: true });
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, defaultViewport: { width: 1280, height: 860 } });
const p = await b.newPage();
for (const [name, path] of (process.argv[2] ?? "home:/,check:/check,office:/office,sent:/sent,breach:/breach-day").split(",").map((x) => x.split(":"))) {
  await p.goto(`http://localhost:5173${path}`, { waitUntil: "networkidle0" }).catch(() => {});
  if (name === "check") { await p.click("::-p-text(Load training sample)").catch(() => {}); await new Promise(r=>setTimeout(r,300)); }
  await new Promise(r=>setTimeout(r,500));
  await p.screenshot({ path: `${dir}${name}.png` as `${string}.png`, fullPage: true });
}
await b.close(); console.log("shots in", dir);
