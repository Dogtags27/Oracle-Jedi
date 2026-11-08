import { getDomain } from "tldts";
import type { CheckRequest } from "./types";

export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "yandex.com", "mail.com",
]);

export const registrableDomain = (hostOrUrl: string) => getDomain(hostOrUrl.toLowerCase()) ?? hostOrUrl.toLowerCase();

const SENSITIVE_ITEMS: [RegExp, string][] = [
  [/\bw-?2s?\b/i, "W-2"],
  [/\b1099(-[a-z]+)?\b/i, "1099"],
  [/\b1098\b/i, "1098"],
  [/social security( number)?|\bssn\b/i, "Social Security number"],
  [/\bitin\b/i, "ITIN"],
  [/passport/i, "Passport"],
  [/driver'?s? licen[cs]e|photo id|government[- ]issued id|\bid card\b/i, "Photo ID"],
  [/bank statements?/i, "Bank statement"],
  [/routing (number|#)|account (number|#)|bank account/i, "Bank account details"],
  [/tax returns?/i, "Tax return"],
  [/pay ?stubs?|payslips?/i, "Pay stub"],
  [/date of birth|\bdob\b/i, "Date of birth"],
  [/medical records?|insurance card/i, "Medical records"],
];

const ASK_VERBS = /\b(send|upload|attach|provide|submit|forward|reply with|email (us|me)|share|scan)\b/i;

const CREDENTIAL_ITEMS: [RegExp, string][] = [
  [/\bpass(word|code)\b/i, "Password"],
  [/\b(one[- ]time|verification|security|login|sign[- ]in|2fa|mfa|authentication|6[- ]digit) (code|pin|number)\b/i, "Login code"],
  [/\b(verify|confirm|validate|unlock|reactivate|restore|re-?validate) (your )?(account|identity|login|mailbox|email|credentials)\b/i, "Account verification"],
  [/\b(card|billing|payment|bank) (details|information|info)\b|\bupdate (your )?(payment|billing)\b/i, "Payment details"],
];

const CREDENTIAL_ACTION = /\b(click|tap|follow|enter|reply|log ?in|sign ?in|visit|open|update|confirm|verify)\b/i;

const PRESSURE: [RegExp, string][] = [
  [/\burgent(ly)?\b|\bimmediately\b|\basap\b/i, "Urgency language"],
  [/within (24|48) hours|by (today|tonight|end of day)|\btoday\b/i, "Tight deadline"],
  [/suspend|penalt|fine|legal action|locked/i, "Threat of penalty"],
  [/gift card|wire transfer|crypto|bitcoin/i, "Unusual payment request"],
  [/don'?t (call|tell)|keep this (confidential|between us)/i, "Asks for secrecy"],
];

const ORG_SUFFIX = /\b(tax|taxes|cpa|cpas|accounting|accountants|bookkeeping|financial|services|group|partners|associates|llc|inc|ltd|law|legal|clinic|health|medical|realty|mortgage|bank|credit union|advisors|consulting)\b/i;

export interface ExtractedRequest {
  isDocumentRequest: boolean;
  score: number;
  requestedItems: string[];
  claimedOrg: string;
  senderEmail: string;
  senderDomain: string;
  emails: string[];
  linkDomains: string[];
  phones: string[];
  pressureSignals: string[];
  credentialAsks: string[];
  isCredentialRequest: boolean;
}

const unique = <T>(items: T[]) => [...new Set(items)];

export const normalizePhone = (phone: string) => phone.replace(/\D/g, "").slice(-10);

const PHONE = /(?<![\w/=.-])(?:\+?1[\s.-])?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w/])/g;

export const findPhones = (text: string) => unique((text.match(PHONE) ?? []).map((p) => p.trim()));

export function stripMarkup(markdown: string): string {
  return markdown
    .replace(/\(\/cdn-cgi\/[^)]*\)/g, "")
    .replace(/\[*email[\s ]protected\]*/gi, "[email hidden by site]")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_>`|]+/g, " ")
    .replace(/[ \t]+/g, " ");
}

function guessOrg(text: string, displayName: string): string {
  const cleanName = displayName.replace(/["<>]/g, "").trim();
  if (cleanName && ORG_SUFFIX.test(cleanName)) return cleanName;
  const intro = text.match(/\b(?:this is|from|on behalf of|team at|here at)\s+([A-Z][\w&'.-]*(?:\s+[A-Z&][\w&'.-]*){0,4})/);
  const introName = intro?.[1] ?? "";
  if (introName && ORG_SUFFIX.test(introName)) return introName.trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(-8).reverse()) {
    if (line.length < 60 && ORG_SUFFIX.test(line) && /^[A-Z0-9]/.test(line) && !/@|https?:/.test(line)) return line.replace(/[,.]$/, "");
  }
  const anywhere = text.match(/\b([A-Z][\w&'-]+(?:\s+[A-Z&][\w&'-]+){0,3}\s+(?:Tax|CPA|CPAs|Accounting|Financial|Services|Group|Partners|Associates|LLC|Inc))\b/);
  return anywhere?.[1]?.trim() ?? cleanName;
}

export function extractRequest(body: string, from = ""): ExtractedRequest {
  const text = `${body}`;
  const fromEmail = from.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() ?? "";
  const displayName = from.replace(/<.*>/, "").replace(fromEmail, "").trim();
  const emails = unique((text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).map((e) => e.toLowerCase()));
  const senderEmail = fromEmail || emails[0] || "";
  const urls = text.match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi) ?? [];
  const linkDomains = unique(
    urls
      .map((u) => {
        try {
          return registrableDomain(new URL(u.startsWith("http") ? u : `https://${u}`).hostname);
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  const phones = findPhones(text);
  const requestedItems = unique(SENSITIVE_ITEMS.filter(([re]) => re.test(text)).map(([, label]) => label));
  const pressureSignals = unique(PRESSURE.filter(([re]) => re.test(text)).map(([, label]) => label));
  const asks = ASK_VERBS.test(text);
  const credentialAsks = unique(CREDENTIAL_ITEMS.filter(([re]) => re.test(text)).map(([, label]) => label));
  const isCredentialRequest = credentialAsks.length > 0 && (asks || CREDENTIAL_ACTION.test(text)) && (urls.length > 0 || pressureSignals.length > 0 || credentialAsks.length > 1);
  const score = requestedItems.length * 2 + (asks ? 2 : 0) + (pressureSignals.length ? 1 : 0) + credentialAsks.length * 2;
  return {
    credentialAsks,
    isCredentialRequest,
    isDocumentRequest: requestedItems.length > 0 && (asks || requestedItems.length > 1),
    score,
    requestedItems,
    claimedOrg: guessOrg(text, displayName),
    senderEmail,
    senderDomain: senderEmail ? registrableDomain(senderEmail.split("@")[1] ?? "") : "",
    emails,
    linkDomains,
    phones,
    pressureSignals,
  };
}

export const toCheckRequest = (x: ExtractedRequest, locationHint?: string): CheckRequest => ({
  claimedOrg: x.claimedOrg,
  senderEmail: x.senderEmail || undefined,
  senderDomain: x.senderDomain,
  linkDomains: x.linkDomains,
  phones: x.phones,
  locationHint,
});
