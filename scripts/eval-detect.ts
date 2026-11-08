import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SENSITIVE_KINDS, abaChecksum, detect, luhn } from "@oj/core/detect";
import { extractRequest } from "@oj/core/request";
import type { FindingKind } from "@oj/core";

const OUT = resolve("evals/results");
mkdirSync(OUT, { recursive: true });

let seed = 4242;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const pick = <T>(xs: T[]) => xs[int(0, xs.length - 1)]!;
const digits = (s: string) => s.replace(/\D/g, "");

function ssnParts() {
  let area = int(1, 899);
  if (area === 666) area = 667;
  return [pad(area, 3), pad(int(1, 99), 2), pad(int(1, 9999), 4)];
}
const routing = () => {
  for (;;) {
    const v = `${pick(["01", "02", "11", "21", "26", "31", "06", "07"])}${pad(int(0, 9999999), 7)}`;
    if (abaChecksum(v)) return v;
  }
};
const card = (sep: string) => {
  for (;;) {
    const v = `${pick(["4", "51", "37"])}${pad(int(0, 99999999), 8)}${pad(int(0, 9999999), 7)}`.slice(0, 16);
    if (luhn(v)) return v.replace(/(\d{4})(?=\d)/g, `$1${sep}`);
  }
};
const months = ["Jan", "Feb", "March", "Apr", "May", "June", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

const GENERATORS: Record<string, () => [FindingKind, string, string]> = {
  ssnDash: () => { const v = ssnParts().join("-"); return ["ssn", `Employee SSN ${v}`, v]; },
  ssnSpace: () => { const v = ssnParts().join(" "); return ["ssn", `Social security number: ${v}`, v]; },
  ssnBare: () => { const v = ssnParts().join(""); return ["ssn", `SSN ${v}`, v]; },
  itin: () => { const v = `9${pad(int(0, 99), 2)}-${pick(["70", "78", "88", "90", "94", "99"])}-${pad(int(1, 9999), 4)}`; return ["itin", `ITIN ${v}`, v]; },
  ein: () => { const v = `${pick(["12", "20", "45", "81", "95"])}-${pad(int(0, 9999999), 7)}`; return ["ein", `Employer ID (EIN) ${v}`, v]; },
  routing: () => { const v = routing(); return ["routing", `${pick(["Routing number", "ABA", "Routing #", "RTN"])}: ${v}`, v]; },
  cardSpace: () => { const v = card(" "); return ["card", `Card number ${v}`, v]; },
  cardDash: () => { const v = card("-"); return ["card", `Paid with ${v}`, v]; },
  cardBare: () => { const v = card(""); return ["card", `CC ${v}`, v]; },
  account: () => { const v = pad(int(10000000, 999999999999), int(8, 12)); return ["account", `${pick(["Account number", "Acct #", "Account No.", "Checking account"])}: ${v}`, v]; },
  dobSlash: () => { const v = `${pad(int(1, 12), 2)}/${pad(int(1, 28), 2)}/${int(1950, 2004)}`; return ["dob", `Date of birth: ${v}`, v]; },
  dobLong: () => { const v = `${pick(months)} ${int(1, 28)}, ${int(1950, 2004)}`; return ["dob", `DOB ${v}`, v]; },
  dobIso: () => { const v = `${int(1950, 2004)}-${pad(int(1, 12), 2)}-${pad(int(1, 28), 2)}`; return ["dob", `Born on ${v}`, v]; },
  mrz: () => { const v = `P<UTO${pick(["SAMPLE", "TESTER", "DOE"])}<<${pick(["JORDAN", "RILEY", "ALEX"])}`.padEnd(44, "<"); return ["mrz", v, v]; },
};

const BENIGN: (() => string)[] = [
  () => `Order #${pad(int(0, 9999999999), 10)} shipped`,
  () => `Tracking 1Z${pad(int(0, 999999), 6)}A${pad(int(0, 99999999), 8)}`,
  () => `Invoice ${int(2020, 2026)}-${pad(int(1, 9999), 4)} total $${int(10, 9999)}.${pad(int(0, 99), 2)}`,
  () => `Meeting on ${pad(int(1, 12), 2)}/${pad(int(1, 28), 2)}/${int(2024, 2026)} at ${int(1, 12)}:${pad(int(0, 59), 2)}`,
  () => `Call (617) 555-${pad(int(100, 199), 4)}`,
  () => `Zip ${pad(int(1000, 99999), 5)}, Boston`,
  () => `Card ending in ${pad(int(0, 9999), 4)}`,
  () => `SSN on file: ***-**-${pad(int(0, 9999), 4)}`,
  () => `Reference ${pad(int(0, 999999999), 9)}`,
  () => `Confirmation code ${pad(int(0, 99999999), 8)}`,
  () => `Version ${int(1, 9)}.${int(0, 20)}.${int(0, 300)}`,
  () => `Server 10.${int(0, 255)}.${int(0, 255)}.${int(0, 255)}`,
  () => `Gift card number ${pad(int(0, 99999999), 8)}${pad(int(0, 99999999), 8)}`,
  () => `Policy ${pad(int(0, 999), 3)}-${pad(int(0, 99), 2)}-${pad(int(0, 9999), 4)}-A`,
  () => `ISBN 978-${int(0, 9)}-${pad(int(0, 9999), 4)}-${pad(int(0, 9999), 4)}-${int(0, 9)}`,
  () => `Wages 84,200.00 · Federal tax withheld 9,812.40`,
  () => `Patient visit ${pick(months)} ${int(1, 28)}, ${int(2024, 2026)}`,
  () => `Timestamp ${int(1600000000, 1800000000)}`,
];

interface Doc {
  text: string;
  truth: { kind: FindingKind; value: string }[];
}

const docs: Doc[] = [];
for (let i = 0; i < 30; i++) {
  const lines: string[] = [];
  const truth: Doc["truth"] = [];
  const n = int(3, 7);
  for (let j = 0; j < n; j++) {
    const [kind, line, value] = GENERATORS[pick(Object.keys(GENERATORS))]!();
    lines.push(line);
    truth.push({ kind, value });
    if (rand() < 0.6) lines.push(pick(BENIGN)());
  }
  docs.push({ text: lines.join("\n"), truth });
}
for (let i = 0; i < 30; i++) docs.push({ text: Array.from({ length: int(4, 9) }, () => pick(BENIGN)()).join("\n"), truth: [] });

const stats: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(SENSITIVE_KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }]));
const falsePositives: string[] = [];
const misses: string[] = [];
for (const d of docs) {
  const found = detect(d.text, SENSITIVE_KINDS);
  const remaining = [...d.truth];
  for (const f of found) {
    const idx = remaining.findIndex((t) => t.kind === f.kind && digits(t.value) === digits(f.value) && (digits(f.value) || t.value === f.value));
    if (idx >= 0) {
      stats[f.kind]!.tp++;
      remaining.splice(idx, 1);
    } else {
      stats[f.kind]!.fp++;
      falsePositives.push(`${f.kind}: "${d.text.slice(Math.max(0, f.start - 25), f.end + 5).replace(/\n/g, " ⏎ ")}"`);
    }
  }
  for (const t of remaining) {
    stats[t.kind]!.fn++;
    misses.push(`${t.kind}: ${t.value}`);
  }
}

const EMAILS: { text: string; from: string; docs: boolean; creds: boolean }[] = [
  { from: "Maple Street Tax <frontdesk@maplestreettax.example>", text: "Hi Jordan, to finish your 2025 return please upload your W-2 and 1099-INT through our portal.", docs: true, creds: false },
  { from: "Oak Avenue CPA <team@oakavenuecpa.example>", text: "Could you send us a copy of your driver's license and last year's tax return?", docs: true, creds: false },
  { from: "HR <hr@harborpoint.example>", text: "Please submit your bank account and routing number for direct deposit by Friday.", docs: true, creds: false },
  { from: "Leasing Office <leasing@elmcourt.example>", text: "For the application we need two recent pay stubs and a photo ID. You can attach them here.", docs: true, creds: false },
  { from: "Clinic <billing@harborclinic.example>", text: "Please provide your insurance card and date of birth before your visit.", docs: true, creds: false },
  { from: "Mortgage team <docs@harborlend.example>", text: "Upload your last two bank statements and your W-2s to continue.", docs: true, creds: false },
  { from: "Payroll <payroll@harborpoint.example>", text: "We need your Social Security number to finish onboarding. Reply with it or use the secure form.", docs: true, creds: false },
  { from: "Maple Street Tax <maplestreet.tax.help@gmail.com>", text: "[TRAINING SAMPLE] We need your W-2 and a photo of your driver's license today. Upload here.", docs: true, creds: false },
  { from: "Registrar <registrar@harbor.example>", text: "Scan and send your passport for the visa letter.", docs: true, creds: false },
  { from: "Daycare <office@littleoaks.example>", text: "Please send your child's birth certificate and your photo ID for enrollment.", docs: true, creds: false },
  { from: "Benefits <benefits@harborpoint.example>", text: "Forward your 1099 and pay stubs for the reimbursement.", docs: true, creds: false },
  { from: "Accountant <sam@samcpa.example>", text: "Can you share your tax returns from 2023 and 2024? Thanks!", docs: true, creds: false },
  { from: "Sam <sam@example.com>", text: "Lunch tomorrow at noon? I'll bring the slides.", docs: false, creds: false },
  { from: "News <news@harbordaily.example>", text: "This week: tax season tips, how W-2 forms work, and our best recipes.", docs: false, creds: false },
  { from: "Shop <orders@cornerbakery.example>", text: "Your order #4815162342 has shipped. Track it with your account.", docs: false, creds: false },
  { from: "Calendar <calendar@harbor.example>", text: "Reminder: dentist appointment on 11/12 at 3 PM.", docs: false, creds: false },
  { from: "Alex <alex@example.com>", text: "Please send the slides from today's meeting when you get a chance.", docs: false, creds: false },
  { from: "Bank <alerts@harborpointcu.example>", text: "Your monthly statement is ready to view in online banking.", docs: false, creds: false },
  { from: "IT <it@harborpoint.example>", text: "You changed your password yesterday. If this was you, no action is needed.", docs: false, creds: false },
  { from: "Coach <coach@harborsoccer.example>", text: "Practice moved to Thursday. Bring water and cleats.", docs: false, creds: false },
  { from: "Tax Office <info@maplestreettax.example>", text: "Our office hours change next week. No action needed.", docs: false, creds: false },
  { from: "Library <hold@harborlib.example>", text: "Your hold is ready for pickup. Your library card account number is on the receipt.", docs: false, creds: false },
  { from: "Portal <alerts@maple-street-taxdocs.example>", text: "[TRAINING SAMPLE] Your portal is locked. Verify your account and enter the 6-digit code here: https://maple-street-taxdocs.example/verify", docs: false, creds: true },
  { from: "Mail Admin <admin@mail-quota.example>", text: "[TRAINING SAMPLE] Mailbox full. Sign in to confirm your password today: https://mail-quota.example/login", docs: false, creds: true },
  { from: "Billing <billing@stream-renew.example>", text: "[TRAINING SAMPLE] Payment failed. Update your payment details within 24 hours: https://stream-renew.example/billing", docs: false, creds: true },
  { from: "Security <security@harborpoint.example>", text: "We'll never ask for your password. Report suspicious messages to IT.", docs: false, creds: false },
  { from: "App <noreply@harborapp.example>", text: "Your verification code is 482913. It expires in 10 minutes. Don't share it.", docs: false, creds: false },
];

const confusion = (pred: boolean[], truth: boolean[]) => {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  pred.forEach((p, i) => {
    if (p && truth[i]) tp++;
    else if (p) fp++;
    else if (truth[i]) fn++;
    else tn++;
  });
  return { tp, fp, fn, tn, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn) };
};
const results = EMAILS.map((e) => extractRequest(e.text, e.from));
const docReq = confusion(results.map((r) => r.isDocumentRequest), EMAILS.map((e) => e.docs));
const credReq = confusion(results.map((r) => r.isCredentialRequest), EMAILS.map((e) => e.creds));
const emailErrors = EMAILS.flatMap((e, i) => [
  ...(results[i]!.isDocumentRequest !== e.docs ? [`document request ${e.docs ? "missed" : "false alarm"}: "${e.text.slice(0, 80)}"`] : []),
  ...(results[i]!.isCredentialRequest !== e.creds ? [`credential request ${e.creds ? "missed" : "false alarm"}: "${e.text.slice(0, 80)}"`] : []),
]);

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const totals = Object.values(stats).reduce((a, s) => ({ tp: a.tp + s.tp, fp: a.fp + s.fp, fn: a.fn + s.fn }), { tp: 0, fp: 0, fn: 0 });
writeFileSync(resolve(OUT, "detect.json"), JSON.stringify({ at: new Date().toISOString(), documents: docs.length, stats, totals, falsePositives, misses, docReq, credReq, emailErrors }, null, 2));
const md = [
  "# Detector eval (EV2) and request detector eval (EV4)",
  "",
  `Run ${new Date().toISOString()}. Rules and checksums only, on the device. ${docs.length} synthetic documents: 30 with planted values in varied formats, 30 benign ones full of look-alike numbers (order and tracking numbers, masked SSNs, card last-4, dates without a birth-date label, policy numbers, ISBNs, IPs).`,
  "",
  "| Data type | Precision | Recall | TP | FP | FN |",
  "|---|---|---|---|---|---|",
  ...SENSITIVE_KINDS.map((k) => {
    const s = stats[k]!;
    return `| ${k} | ${s.tp + s.fp ? pct(s.tp / (s.tp + s.fp)) : "n/a"} | ${s.tp + s.fn ? pct(s.tp / (s.tp + s.fn)) : "n/a"} | ${s.tp} | ${s.fp} | ${s.fn} |`;
  }),
  `| **all** | **${pct(totals.tp / Math.max(1, totals.tp + totals.fp))}** | **${pct(totals.tp / Math.max(1, totals.tp + totals.fn))}** | ${totals.tp} | ${totals.fp} | ${totals.fn} |`,
  "",
  `| Email classifier (${EMAILS.length} labeled emails, fictional senders) | Precision | Recall | TP | FP | FN | TN |`,
  "|---|---|---|---|---|---|---|",
  `| Asks for sensitive documents | ${pct(docReq.precision)} | ${pct(docReq.recall)} | ${docReq.tp} | ${docReq.fp} | ${docReq.fn} | ${docReq.tn} |`,
  `| Asks for a password, login code or payment details | ${pct(credReq.precision)} | ${pct(credReq.recall)} | ${credReq.tp} | ${credReq.fp} | ${credReq.fn} | ${credReq.tn} |`,
  "",
  falsePositives.length ? `False positives: ${falsePositives.slice(0, 8).join("; ")}` : "No false positives.",
  "",
  misses.length ? `Misses: ${misses.slice(0, 8).join("; ")}` : "No misses.",
  "",
  emailErrors.length ? `Email classifier errors: ${emailErrors.join("; ")}` : "No email classifier errors.",
  "",
].join("\n");
writeFileSync(resolve(OUT, "detect.md"), md);
console.log(md);
