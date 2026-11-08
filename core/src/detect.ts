import type { Finding, FindingKind } from "./types";

export const KIND_LABEL: Record<FindingKind, [string, string]> = {
  ssn: ["Social Security number", "Social Security numbers"],
  itin: ["ITIN", "ITINs"],
  ein: ["EIN", "EINs"],
  routing: ["routing number", "routing numbers"],
  card: ["card number", "card numbers"],
  account: ["account number", "account numbers"],
  dob: ["date of birth", "dates of birth"],
  mrz: ["passport MRZ line", "passport MRZ lines"],
  email: ["email address", "email addresses"],
  phone: ["phone number", "phone numbers"],
};

export const SENSITIVE_KINDS: FindingKind[] = ["ssn", "itin", "ein", "routing", "card", "account", "dob", "mrz"];

const PRIORITY: FindingKind[] = ["mrz", "card", "ssn", "itin", "ein", "routing", "account", "dob", "phone", "email"];

const digits = (s: string) => s.replace(/\D/g, "");

function before(text: string, index: number, span = 48) {
  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const same = text.slice(Math.max(lineStart, index - span), index);
  if (same.trim()) return same.toLowerCase();
  const prevStart = text.lastIndexOf("\n", lineStart - 2) + 1;
  return text.slice(Math.max(prevStart, lineStart - span), lineStart).toLowerCase();
}

const SSN_CONTEXT = /(\bssn\b|\bss#|\bss no|social security|soc\.? sec|taxpayer id|\btin\b)/;
const ITIN_CONTEXT = /\bitin\b|individual taxpayer/;
const EIN_CONTEXT = /\bf?ein\b|employer id|employer identification|tax id|federal id/;
const ROUTING_CONTEXT = /routing|\baba\b|\brtn\b|transit/;
const ACCOUNT_CONTEXT = /(account|acct|a\/c|acc\.?)\s*(no\.?|num(ber)?|#|:)?[\s:#.-]*$|(account|acct)(\s+\w+){0,3}\s*[:#]?\s*$/;
const DOB_CONTEXT = /(dob|d\.o\.b|date of birth|birth ?date|born( on)?)\W{0,6}$/;
const ITIN_GROUPS = /^(5\d|6[0-5]|7\d|8[0-8]|9[0-2]|9[4-9])$/;
const EIN_INVALID = new Set(["00", "07", "08", "09", "17", "18", "19", "28", "29", "49", "69", "70", "78", "79", "89", "96", "97"]);

export const isSampleSsn = (value: string) => /^98765432\d$/.test(digits(value));

export function validSsnParts(value: string) {
  const d = digits(value);
  if (d.length !== 9) return false;
  const area = d.slice(0, 3);
  return area !== "000" && area !== "666" && area[0] !== "9" && d.slice(3, 5) !== "00" && d.slice(5) !== "0000";
}

export function validItin(value: string) {
  const d = digits(value);
  return d.length === 9 && d[0] === "9" && ITIN_GROUPS.test(d.slice(3, 5));
}

export function abaChecksum(value: string) {
  const d = digits(value);
  if (d.length !== 9) return false;
  const prefix = Number(d.slice(0, 2));
  if (!((prefix >= 0 && prefix <= 12) || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80)) return false;
  const n = d.split("").map(Number);
  return (3 * (n[0]! + n[3]! + n[6]!) + 7 * (n[1]! + n[4]! + n[7]!) + (n[2]! + n[5]! + n[8]!)) % 10 === 0;
}

export function luhn(value: string) {
  const d = digits(value);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

const cardIssuer = (d: string) =>
  /^4/.test(d) || /^5[1-5]/.test(d) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(d) || /^3[47]/.test(d) || /^6(011|5|4[4-9])/.test(d) || /^35/.test(d) || /^3(0[0-5]|[689])/.test(d);

function validDate(m: number, d: number, y: number) {
  if (y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) return false;
  return new Date(y, m - 1, d).getDate() === d;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDate(raw: string): boolean {
  let m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validDate(Number(m[2]), Number(m[3]), Number(m[1]));
  m = raw.match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/i);
  if (m) return validDate(MONTHS.indexOf(m[1]!.toLowerCase()) + 1, Number(m[2]), Number(m[3]));
  m = raw.match(/^(\d{1,2}) ([a-z]{3})[a-z]*\.? (\d{4})$/i);
  if (m) return validDate(MONTHS.indexOf(m[2]!.toLowerCase()) + 1, Number(m[1]), Number(m[3]));
  return false;
}

type Push = (kind: FindingKind, start: number, value: string, confidence: Finding["confidence"], sample?: boolean) => void;

function scanSsnItin(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![\w-])(\d{3})([- ])(\d{2})\2(\d{4})(?![\w-])/g)) {
    const value = m[0];
    if (isSampleSsn(value)) push("ssn", m.index, value, "high", true);
    else if (validItin(value)) push("itin", m.index, value, "high");
    else if (validSsnParts(value)) push("ssn", m.index, value, "high");
  }
  for (const m of text.matchAll(/(?<![\w-])\d{9}(?![\w-])/g)) {
    const ctx = before(text, m.index);
    if (ROUTING_CONTEXT.test(ctx)) continue;
    if (SSN_CONTEXT.test(ctx) && (validSsnParts(m[0]) || isSampleSsn(m[0]))) push("ssn", m.index, m[0], "high", isSampleSsn(m[0]));
    else if (ITIN_CONTEXT.test(ctx) && validItin(m[0])) push("itin", m.index, m[0], "high");
  }
}

function scanEin(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![\w-])(\d{2})-(\d{7})(?![\w-])/g)) {
    if (EIN_INVALID.has(m[1]!)) continue;
    push("ein", m.index, m[0], EIN_CONTEXT.test(before(text, m.index)) ? "high" : "medium");
  }
}

function scanRouting(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![\w-])\d{9}(?![\w-])/g)) {
    if (!abaChecksum(m[0])) continue;
    if (ROUTING_CONTEXT.test(before(text, m.index))) push("routing", m.index, m[0], "high");
  }
}

function scanCards(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![\w-])\d(?:[ -]?\d){12,18}(?![\w-])/g)) {
    const d = digits(m[0]);
    if (luhn(d) && cardIssuer(d) && !/^(\d)\1+$/.test(d)) push("card", m.index, m[0], "high");
  }
}

function scanAccounts(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![\w-])(?:\d[ -]?){5,16}\d(?![\w-])/g)) {
    const ctx = before(text, m.index, 36);
    if (!ACCOUNT_CONTEXT.test(ctx) || ROUTING_CONTEXT.test(ctx.slice(-14))) continue;
    if (/^(19|20)\d{2}$/.test(digits(m[0]))) continue;
    push("account", m.index, m[0], "high");
  }
}

function scanDob(text: string, push: Push) {
  const re = /(?<![\w/.-])(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2} [A-Za-z]{3,9}\.? \d{4})(?![\w/-])/g;
  for (const m of text.matchAll(re)) {
    if (DOB_CONTEXT.test(before(text, m.index, 24)) && parseDate(m[0])) push("dob", m.index, m[0], "high");
  }
}

function scanMrz(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![A-Z0-9<])[A-Z0-9<]{30,44}(?![A-Z0-9<])/g)) {
    const line = m[0];
    if ((line.length === 30 || line.length === 44) && (line.match(/</g) ?? []).length >= 2) push("mrz", m.index, line, "high");
  }
}

const PHONE = /(?<![\w/=.-])(?:\+?1[\s.-])?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w/])/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export function detect(text: string, kinds?: FindingKind[]): Finding[] {
  const raw: Finding[] = [];
  const push: Push = (kind, start, value, confidence, sample) =>
    raw.push({ kind, value, start, end: start + value.length, confidence, ...(sample ? { sample: true } : {}) });
  scanMrz(text, push);
  scanCards(text, push);
  scanSsnItin(text, push);
  scanEin(text, push);
  scanRouting(text, push);
  scanAccounts(text, push);
  scanDob(text, push);
  for (const m of text.matchAll(PHONE)) push("phone", m.index, m[0], "medium");
  for (const m of text.matchAll(EMAIL)) push("email", m.index, m[0], "medium");

  const ordered = raw.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.start - b.start);
  const kept: Finding[] = [];
  for (const f of ordered) {
    if (kinds && !kinds.includes(f.kind)) continue;
    if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
    kept.push(f);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function countKinds(findings: Pick<Finding, "kind">[]): Partial<Record<FindingKind, number>> {
  const out: Partial<Record<FindingKind, number>> = {};
  for (const f of findings) out[f.kind] = (out[f.kind] ?? 0) + 1;
  return out;
}

export function describeFindings(findings: Pick<Finding, "kind">[], only: FindingKind[] = SENSITIVE_KINDS): string {
  const counts = countKinds(findings.filter((f) => only.includes(f.kind)));
  const parts = PRIORITY.filter((k) => counts[k]).map((k) => `${counts[k]} ${KIND_LABEL[k][counts[k] === 1 ? 0 : 1]}`);
  if (!parts.length) return "";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function redactText(text: string, findings: Pick<Finding, "start" | "end">[]): string {
  let out = "";
  let cursor = 0;
  for (const f of [...findings].sort((a, b) => a.start - b.start)) {
    if (f.start < cursor) continue;
    out += text.slice(cursor, f.start) + text.slice(f.start, f.end).replace(/[^\s]/g, "█");
    cursor = f.end;
  }
  return out + text.slice(cursor);
}
