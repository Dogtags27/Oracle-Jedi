import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { SENSITIVE_KINDS, detect } from "@oj/core/detect";

const APP = process.env.APP ?? "http://localhost:5173";
const API = process.env.API ?? "http://localhost:8787/api";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = resolve("evals/results");
mkdirSync(OUT, { recursive: true });

const FILE = resolve("fixtures/bank-statement-sample.pdf");
const SECRETS = ["987-65-4322", "987654322", "4400 1234 56", "4400123456", "261073986", "bank-statement-sample", "Jordan Q. Sample", "88 Elm Court"];
const MESSAGE_ONLY = ["To finish your 2025 return", "photo of your driver's license"];

interface Captured {
  page: string;
  url: string;
  method: string;
  b64: string;
}

const text = (t: string) => `::-p-text(${t})`;
const checks: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` · ${detail}` : ""}`);
};

function entropy(bytes: Uint8Array) {
  if (!bytes.length) return 0;
  const counts = new Array(256).fill(0);
  for (const b of bytes) counts[b]++;
  return counts.reduce((h, c) => (c ? h - (c / bytes.length) * Math.log2(c / bytes.length) : h), 0);
}

async function instrument(page: Page, label: string, captured: Captured[], loads: { page: string; url: string; type: string }[]) {
  page.on("request", (r) => loads.push({ page: label, url: r.url(), type: r.resourceType() }));
  await page.exposeFunction(`__ojCapture_${label}`, (c: Omit<Captured, "page">) => captured.push({ page: label, ...c }));
  await page.evaluateOnNewDocument(`(() => {
    const fn = "__ojCapture_${label}";
    const original = window.fetch;
    const toB64 = function (bytes) {
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    };
    window.fetch = async function (input, init) {
      init = init || {};
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = init.body;
      let bytes = new Uint8Array();
      if (typeof body === "string") bytes = new TextEncoder().encode(body);
      else if (body instanceof Uint8Array) bytes = body;
      else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
      else if (body instanceof Blob) bytes = new Uint8Array(await body.arrayBuffer());
      await window[fn]({ url: url, method: init.method || "GET", b64: toB64(bytes) });
      return original.call(this, input, init);
    };
  })();`);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const captured: Captured[] = [];
const loads: { page: string; url: string; type: string }[] = [];
try {
  const office = await browser.newPage();
  await instrument(office, "office", captured, loads);
  await office.goto(`${APP}/office`, { waitUntil: "networkidle0" });
  const inputs = await office.$$("input:not([type=file])");
  await inputs[0]!.click();
  await office.keyboard.down("Control");
  await office.keyboard.press("A");
  await office.keyboard.up("Control");
  await inputs[0]!.type("Privacy Check Tax");
  await inputs[1]!.type(`privacy-${Date.now()}.test`);
  await inputs[2]!.type("may the force be with you");
  await inputs[3]!.type("may the force be with you");
  await office.click(text("Generate keys & register"));
  await office.waitForSelector(text("Sealed inbox"), { timeout: 30000 });
  await office.click(text("Create request link"));
  await office.waitForSelector(text("Latest request link"), { timeout: 15000 });
  const link = await office.evaluate(() => [...document.querySelectorAll("p")].map((p) => p.textContent!.trim()).find((t) => t.includes("/r/rq_"))!);

  const client = await browser.newPage();
  await instrument(client, "client", captured, loads);
  await client.goto(link, { waitUntil: "networkidle0" });
  await client.waitForSelector(text("Office key signature valid"), { timeout: 15000 });
  await (await client.$("input[type=file]"))!.uploadFile(FILE);
  await client.waitForSelector(text("Contains"), { timeout: 20000 });
  await client.click(text("Seal & send"));
  await client.waitForSelector(text("receipt verified"), { timeout: 30000 });

  await office.bringToFront();
  await office.waitForSelector(`button${text("Decrypt")}`, { timeout: 15000 });
  await office.click(`button${text("Decrypt")}`);
  await office.waitForSelector(text("decrypted locally in this tab"), { timeout: 30000 });

  const checker = await browser.newPage();
  await instrument(checker, "check", captured, loads);
  await checker.goto(`${APP}/check`, { waitUntil: "networkidle0" });
  await checker.click(text("Load training sample"));
  await checker.click(`button${text("Check who's asking")}`);
  await checker.waitForSelector("::-p-xpath(//p[normalize-space()='Verified' or normalize-space()=\"Doesn't match\" or normalize-space()='Unknown'])", { timeout: 25000 });

  await client.bringToFront();
  await client.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Revoke")?.click());
  await new Promise((r) => setTimeout(r, 1500));
} finally {
  await browser.close();
}

const decoded = captured.map((c) => ({ ...c, bytes: new Uint8Array(Buffer.from(c.b64, "base64")) }));
const textual = decoded.filter((c) => c.method !== "PUT");
const uploads = decoded.filter((c) => c.method === "PUT");
const asText = (b: Uint8Array) => Buffer.from(b).toString("latin1");

const leaks = decoded.flatMap((c) => {
  const haystack = `${decodeURIComponent(c.url)}\n${asText(c.bytes)}`;
  return SECRETS.filter((s) => haystack.includes(s)).map((s) => `${c.method} ${new URL(c.url).pathname}: "${s}"`);
});
check("No SSN, account or routing number, name, address or filename in any request (URL or body)", leaks.length === 0, leaks.length ? leaks.join("; ") : `${decoded.length} requests scanned`);

const ruleHits = textual.flatMap((c) => detect(`${decodeURIComponent(c.url)}\n${asText(c.bytes)}`, SENSITIVE_KINDS).map((f) => `${c.method} ${new URL(c.url).pathname}: ${f.kind}`));
check("Detectors find no sensitive patterns in any JSON body or URL", ruleHits.length === 0, ruleHits.join("; "));

const ent = uploads.map((u) => entropy(u.bytes));
check(
  "Every upload is indistinguishable from random bytes (entropy ≥ 7.9 bits/byte)",
  uploads.length > 0 && ent.every((e) => e >= 7.9),
  `${uploads.length} upload(s): ${ent.map((e) => e.toFixed(4)).join(", ")} bits/byte, ${uploads.map((u) => u.bytes.length).join(", ")} bytes`,
);

const checkCalls = decoded.filter((c) => c.page === "check" && c.url.includes("/check"));
const checkLeak = checkCalls.some((c) => MESSAGE_ONLY.some((m) => asText(c.bytes).includes(m)));
const checkFields = checkCalls.map((c) => Object.keys(JSON.parse(asText(c.bytes) || "{}")).sort().join(","));
check("Check sends the claim, never the message text", checkCalls.length > 0 && !checkLeak, `fields sent: ${[...new Set(checkFields)].join(" | ")}`);

const appOrigin = new URL(APP).origin;
const apiOrigin = new URL(API).origin;
const thirdParty = loads.filter((l) => {
  const o = new URL(l.url).origin;
  return !/^(data|blob|chrome|chrome-extension):/.test(l.url) && o !== appOrigin && o !== apiOrigin && !/supabase\.co$/.test(new URL(l.url).hostname);
});
check("Zero third-party requests (no scripts, fonts, analytics or trackers) on /office, /r and /check", thirdParty.length === 0, thirdParty.map((l) => `${l.type} ${l.url}`).join("; "));
const scripts = loads.filter((l) => l.type === "script" && !/^(chrome|chrome-extension):/.test(l.url) && new URL(l.url).origin !== appOrigin);
check("Every script is first-party", scripts.length === 0, scripts.map((s) => s.url).join("; "));

const res = await fetch(`${API}/health`);
const want: [string, RegExp][] = [
  ["referrer-policy", /no-referrer/],
  ["cache-control", /no-store/],
  ["x-content-type-options", /nosniff/],
  ["strict-transport-security", /max-age/],
  ["x-frame-options", /SAMEORIGIN|DENY/],
];
const missing = want.filter(([h, re]) => !re.test(res.headers.get(h) ?? "")).map(([h]) => h);
check("API security headers present (no-referrer, no-store, nosniff, HSTS, frame options)", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "");
const evil = await fetch(`${API}/health`, { headers: { Origin: "https://evil.example" } });
check("API refuses CORS for unknown web origins", !evil.headers.get("access-control-allow-origin"), evil.headers.get("access-control-allow-origin") ?? "no CORS header");

const vercel = JSON.parse(readFileSync(resolve("frontend/vercel.json"), "utf8")) as { headers: { headers: { key: string; value: string }[] }[] };
const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy")?.value ?? "";
const cspOk = /script-src 'self'/.test(csp) && !/unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp);
check("Deployed pages ship a strict CSP (first-party scripts only, no framing, no plugins) + no-referrer", cspOk && vercel.headers.flatMap((h) => h.headers).some((h) => h.key === "Referrer-Policy" && h.value === "no-referrer"), "from frontend/vercel.json");

const byHost = new Map<string, { requests: number; bytes: number }>();
for (const c of decoded) {
  const flow = c.page === "check" ? "Check who's asking" : c.page === "client" ? "Client: seal & send" : "Office: register, request, open";
  const key = `${flow}|${new URL(c.url).host}|${c.method === "PUT" ? "ciphertext" : "JSON"}`;
  const e = byHost.get(key) ?? { requests: 0, bytes: 0 };
  e.requests++;
  e.bytes += c.bytes.length;
  byHost.set(key, e);
}

const passed = checks.every((c) => c.pass);
writeFileSync(resolve(OUT, "privacy.json"), JSON.stringify({ at: new Date().toISOString(), passed, checks, egress: Object.fromEntries(byHost) }, null, 2));
writeFileSync(
  resolve(OUT, "privacy.md"),
  [
    "# Privacy assertions (TS6) and egress budget (EV6)",
    "",
    `Run ${new Date().toISOString()}: an office registers and creates a request link, then a client seals an **untrimmed** bank statement (SSN, account and routing numbers) and the office opens it, then someone runs a Check. Every request was captured below the app with a fetch hook, independent of our own Privacy Ledger.`,
    "",
    "| Assertion | Result | Detail |",
    "|---|---|---|",
    ...checks.map((c) => `| ${c.name} | ${c.pass ? "✓ pass" : "✕ FAIL"} | ${c.detail.replace(/\|/g, "/")} |`),
    "",
    "| Flow | Destination | Kind | Requests | Bytes sent |",
    "|---|---|---|---|---|",
    ...[...byHost].map(([k, v]) => {
      const [flow, host, kind] = k.split("|");
      return `| ${flow} | ${host} | ${kind} | ${v.requests} | ${v.bytes.toLocaleString()} |`;
    }),
    "",
  ].join("\n"),
);
console.log(passed ? "\nAll privacy assertions passed." : "\nPrivacy assertions FAILED.");
if (!passed) process.exitCode = 1;
