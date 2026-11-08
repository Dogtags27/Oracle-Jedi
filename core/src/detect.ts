import type { Finding, FindingKind } from "./types";
import { detectLanguage } from "./i18n/lang";
import type { Locale } from "./i18n";
import { describeKinds } from "./findings";

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
  iban: ["IBAN", "IBANs"],
  national_id: ["national ID number", "national ID numbers"],
  tax_id: ["tax ID number", "tax ID numbers"],
  social_insurance: ["social insurance number", "social insurance numbers"],
};

export const SENSITIVE_KINDS: FindingKind[] = ["ssn", "itin", "ein", "routing", "card", "account", "dob", "mrz", "iban", "national_id", "tax_id", "social_insurance"];

const PRIORITY: FindingKind[] = ["mrz", "iban", "card", "social_insurance", "national_id", "tax_id", "ssn", "itin", "ein", "routing", "account", "dob", "phone", "email"];

export const KIND_ORDER: readonly FindingKind[] = PRIORITY;

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
const ACCOUNT_CONTEXT_INTL = /(cuenta|compte|kontonummer|konto|conta)\s*(n[º°o]\.?|n[úu]m(ero|éro)?\.?|nr\.?|#|:)?[\s:#.-]*$|(n[º°o]\.?|n[úu]mero|num[ée]ro)\s+(de\s+|da\s+)?(cuenta|compte|conta)\s*[:#]?\s*$/u;
const DOB_CONTEXT = /(dob|d\.o\.b|date of birth|birth ?date|born( on)?)\W{0,6}$/;
const DOB_CONTEXT_INTL = /(fecha de nacimiento|f\. ?nac\.?|nacid[oa] el|date de naissance|n[ée]e? le|geburtsdatum|geb\.|geboren am|data de nascimento|nascid[oa] em|d\. ?nasc\.?)[^\p{L}\p{N}]{0,6}$/u;
const DNI_CONTEXT = /(dni|nie|nif|documento|identidad|identificaci[óo]n)[^\p{L}\p{N}]{0,12}$/u;
const NSS_ES_CONTEXT = /(seguridad social|nuss|afiliaci[óo]n)[^\p{L}\p{N}]{0,16}$/u;
const NIR_CONTEXT = /(s[ée]curit[ée] sociale|\bnir\b|n[°o]\s*ss|n[°o] de s[ée]cu|assur[ée])[^\p{L}\p{N}]{0,16}$/u;
const STEUER_CONTEXT = /(steuer-?id|steuerliche identifikationsnummer|identifikationsnummer|idnr|\btin\b|steuer-?identifikationsnummer)[^\p{L}\p{N}]{0,12}$/u;
const CPF_CONTEXT = /\bcpf\b[^\p{L}\p{N}]{0,8}$/u;
const NIF_PT_CONTEXT = /(\bnif\b|contribuinte|n[úu]mero fiscal)[^\p{L}\p{N}]{0,12}$/u;
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

const MONTHS: Record<string, number> = {
  jan: 1, ene: 1, feb: 2, fev: 2, mar: 3, mrz: 3, apr: 4, abr: 4, avr: 4, may: 5, mai: 5, jun: 6, jul: 7,
  aug: 8, ago: 8, aou: 8, sep: 9, set: 9, oct: 10, okt: 10, out: 10, nov: 11, dec: 12, dic: 12, dez: 12,
};

function monthIndex(name: string): number {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (n.startsWith("juin")) return 6;
  if (n.startsWith("juil")) return 7;
  return MONTHS[n.slice(0, 3)] ?? 0;
}

function parseDate(raw: string): boolean {
  let m = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3])) || validDate(Number(m[2]), Number(m[1]), Number(m[3]));
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validDate(Number(m[2]), Number(m[3]), Number(m[1]));
  m = raw.match(/^(\p{L}{3})\p{L}*\.? (\d{1,2}),? (\d{4})$/u);
  if (m) return validDate(monthIndex(m[1]!), Number(m[2]), Number(m[3]));
  m = raw.match(/^(\d{1,2})\.? (?:de )?(\p{L}{3,})\.? (?:de )?(\d{4})$/u);
  if (m) return validDate(monthIndex(m[2]!), Number(m[1]), Number(m[3]));
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
    if (!(ACCOUNT_CONTEXT.test(ctx) || ACCOUNT_CONTEXT_INTL.test(ctx)) || ROUTING_CONTEXT.test(ctx.slice(-14))) continue;
    if (/^(19|20)\d{2}$/.test(digits(m[0]))) continue;
    push("account", m.index, m[0], "high");
  }
}

function scanDob(text: string, push: Push) {
  const re = /(?<![\p{L}\p{N}_/.-])(\d{1,2}[/.-]\d{1,2}[/.-]\d{4}|\d{4}-\d{2}-\d{2}|\p{L}{3,9}\.? \d{1,2},? \d{4}|\d{1,2}\.? (?:de )?\p{L}{3,10}\.? (?:de )?\d{4})(?![\p{L}\p{N}_/-])/gu;
  for (const m of text.matchAll(re)) {
    const ctx = before(text, m.index, 28);
    if ((DOB_CONTEXT.test(ctx) || DOB_CONTEXT_INTL.test(ctx)) && parseDate(m[0])) push("dob", m.index, m[0], "high");
  }
}

const IBAN_LENGTH: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22,
  DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21,
  HU: 28, IE: 22, IL: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24,
  ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24,
  SE: 24, SI: 19, SK: 24, SM: 27, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export function ibanValid(value: string): boolean {
  const s = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) || IBAN_LENGTH[s.slice(0, 2)] !== s.length) return false;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const v = ch >= "A" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

function scanIban(text: string, push: Push) {
  for (const m of text.matchAll(/(?<![A-Za-z0-9])([A-Z]{2})\d{2}/g)) {
    const len = IBAN_LENGTH[m[1]!];
    if (!len) continue;
    let end = m.index;
    let compact = "";
    while (end < text.length && compact.length < len) {
      const ch = text[end]!;
      if (/[A-Za-z0-9]/.test(ch)) {
        compact += ch;
        end++;
      } else if ((ch === " " || ch === "-") && compact.length % 4 === 0 && /[A-Za-z0-9]/.test(text[end + 1] ?? "")) end++;
      else break;
    }
    if (compact.length !== len || /[A-Za-z0-9]/.test(text[end] ?? "")) continue;
    if (ibanValid(compact)) push("iban", m.index, text.slice(m.index, end), "high");
  }
}

const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

export function validDniNie(value: string): boolean {
  const s = value.replace(/[\s-]/g, "").toUpperCase();
  const m = s.match(/^([XYZ]?)(\d{7,8})([A-Z])$/);
  if (!m) return false;
  if (m[1] ? m[2]!.length !== 7 : m[2]!.length !== 8) return false;
  const n = Number(`${m[1] ? "XYZ".indexOf(m[1]) : ""}${m[2]}`);
  return DNI_LETTERS[n % 23] === m[3];
}

export function validNir(value: string): boolean {
  const s = value.replace(/\s/g, "").toUpperCase();
  if (!/^[12]\d{4}(\d{2}|2A|2B)\d{6}\d{2}$/.test(s)) return false;
  const body = Number(s.slice(0, 13).replace("2A", "19").replace("2B", "18"));
  return 97 - (body % 97) === Number(s.slice(13));
}

export function validSteuerId(value: string): boolean {
  const d = digits(value);
  if (d.length !== 11 || d[0] === "0") return false;
  const counts = new Map<string, number>();
  for (const c of d.slice(0, 10)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const repeated = [...counts.values()].filter((n) => n > 1);
  if (repeated.length !== 1 || repeated[0]! > 3) return false;
  let product = 10;
  for (let i = 0; i < 10; i++) {
    let sum = (Number(d[i]) + product) % 10;
    if (sum === 0) sum = 10;
    product = (sum * 2) % 11;
  }
  const check = (11 - product) % 10;
  return check === Number(d[10]);
}

export function validCpf(value: string): boolean {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function validNifPt(value: string): boolean {
  const d = digits(value);
  if (d.length !== 9 || !/^[1235689]/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (9 - i);
  const r = 11 - (sum % 11);
  return (r >= 10 ? 0 : r) === Number(d[8]);
}

export function validNssEs(value: string): boolean {
  const d = digits(value);
  if (d.length !== 12) return false;
  return Number(d.slice(0, 10)) % 97 === Number(d.slice(10));
}

function scanNational(text: string, push: Push, lang: Locale | null) {
  for (const m of text.matchAll(/(?<![\w-])([XYZxyz][- ]?\d{7}|\d{8})[- ]?([A-Za-z])(?![\w-])/g)) {
    if (!validDniNie(m[0])) continue;
    const ctx = DNI_CONTEXT.test(before(text, m.index));
    if (lang === "es" || ctx) push("national_id", m.index, m[0], ctx ? "high" : "medium");
  }
  for (const m of text.matchAll(/(?<![\w-])\d{2}[/ -]?\d{8}[/ -]?\d{2}(?![\w-])/g)) {
    if (validNssEs(m[0]) && NSS_ES_CONTEXT.test(before(text, m.index))) push("social_insurance", m.index, m[0], "high");
  }
  for (const m of text.matchAll(/(?<![\w-])[12] ?\d{2} ?\d{2} ?(?:\d{2}|2[AB]) ?\d{3} ?\d{3} ?\d{2}(?![\w-])/g)) {
    if (!validNir(m[0])) continue;
    const ctx = NIR_CONTEXT.test(before(text, m.index));
    if (lang === "fr" || ctx) push("social_insurance", m.index, m[0], "high");
  }
  for (const m of text.matchAll(/(?<![\w-])\d{2} ?\d{3} ?\d{3} ?\d{3}(?![\w-])/g)) {
    if (!validSteuerId(m[0])) continue;
    const ctx = STEUER_CONTEXT.test(before(text, m.index));
    if (ctx || lang === "de") push("tax_id", m.index, m[0], ctx ? "high" : "medium");
  }
  for (const m of text.matchAll(/(?<![\w.-])(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})(?![\w-])/g)) {
    if (!validCpf(m[0])) continue;
    const ctx = CPF_CONTEXT.test(before(text, m.index));
    const formatted = m[0].includes(".");
    if (ctx || (formatted && lang !== "en")) push("tax_id", m.index, m[0], "high");
  }
  for (const m of text.matchAll(/(?<![\w-])\d{3} ?\d{3} ?\d{3}(?![\w-])/g)) {
    if (validNifPt(m[0]) && NIF_PT_CONTEXT.test(before(text, m.index)) && (lang === "pt" || lang === null || /contribuinte/.test(before(text, m.index)))) push("tax_id", m.index, m[0], "high");
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

export function detect(text: string, kinds?: FindingKind[], language?: Locale | null): Finding[] {
  const raw: Finding[] = [];
  const push: Push = (kind, start, value, confidence, sample) =>
    raw.push({ kind, value, start, end: start + value.length, confidence, ...(sample ? { sample: true } : {}) });
  const lang = language === undefined ? detectLanguage(text).lang : language;
  scanMrz(text, push);
  scanIban(text, push);
  scanNational(text, push, lang);
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

export function describeFindings(findings: Pick<Finding, "kind">[], only: FindingKind[] = SENSITIVE_KINDS, locale: Locale = "en"): string {
  return describeKinds(countKinds(findings.filter((f) => only.includes(f.kind))), PRIORITY, locale);
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
