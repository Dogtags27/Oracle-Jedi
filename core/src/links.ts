import { getDomainWithoutSuffix, getHostname } from "tldts";
import { registrableDomain } from "./request";

export type LinkRisk =
  | "script"
  | "text_mismatch"
  | "userinfo"
  | "punycode"
  | "ip_host"
  | "lookalike"
  | "not_official"
  | "shortener"
  | "free_host"
  | "tracker"
  | "download";

export type RiskLevel = "high" | "medium" | "low";

export interface LinkCheck {
  href: string;
  host: string;
  domain: string;
  shownDomain?: string;
  risks: LinkRisk[];
  reasons: string[];
  level: RiskLevel;
}

export interface LinkContext {
  officialDomain?: string;
  officialName?: string;
  trustedHosts?: string[];
}

export interface AttachmentCheck {
  name: string;
  ext: string;
  level: RiskLevel;
  reason: string;
}

export const KNOWN_PORTALS = new Set([
  "sharefile.com", "taxdome.com", "smartvault.com", "canopytax.com", "verifyle.com", "liscio.me", "onvio.us",
  "citrixdata.com", "docusign.net", "docusign.com",
]);

const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly", "shorturl.at",
  "rb.gy", "t.ly", "tiny.cc", "s.id", "lnkd.in", "bl.ink", "short.io", "qrco.de", "linktr.ee", "v.gd", "tr.im",
]);

const FREE_HOSTS = new Set([
  "github.io", "netlify.app", "vercel.app", "pages.dev", "workers.dev", "web.app", "firebaseapp.com", "glitch.me",
  "weebly.com", "wixsite.com", "blogspot.com", "000webhostapp.com", "ngrok.io", "ngrok-free.app", "r2.dev", "ipfs.io",
  "herokuapp.com", "onrender.com", "replit.app", "repl.co", "framer.app", "webflow.io", "carrd.co", "notion.site",
  "square.site", "godaddysites.com", "sites.google.com", "forms.gle", "jotform.com", "typeform.com", "surge.sh",
]);

const TRACKERS = new Set([
  "sendgrid.net", "list-manage.com", "mcusercontent.com", "hubspotlinks.com", "hs-sites.com", "mandrillapp.com",
  "mailgun.org", "sparkpostmail.com", "exacttarget.com", "rs6.net", "cmail19.com", "cmail20.com", "klclick.com",
  "klclick1.com", "mailchi.mp", "createsend1.com", "awstrack.me", "substack.com", "beehiiv.com", "convertkit-mail.com",
]);

const HIGH = new Set<LinkRisk>(["script", "text_mismatch", "userinfo", "punycode", "ip_host", "lookalike"]);

const RUNS_CODE = /\.(exe|scr|msi|bat|cmd|com|pif|cpl|ps1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|jar|apk|appx|msix|reg)$/i;
const OPENS_PAGE = /\.(html?|shtml|xhtml|svg|mht|mhtml)$/i;
const DISK_IMAGE = /\.(iso|img|vhdx?|dmg)$/i;
const MACROS = /\.(docm|dotm|xlsm|xltm|xlam|pptm|potm|ppam)$/i;
const ARCHIVE = /\.(zip|rar|7z|gz|tgz|tar|cab|ace)$/i;
const DOWNLOAD_PATH = /\.(exe|scr|msi|bat|cmd|ps1|vbs|js|hta|lnk|jar|apk|iso|img|vhdx?|dmg|zip|rar|7z|docm|xlsm|pptm)$/i;

const SHOWN_DOMAIN = /^\s*(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#:]\S*)?\s*$/i;

export function unwrapRedirect(href: string): string {
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    if ((host === "www.google.com" || host === "google.com") && url.pathname === "/url") {
      return url.searchParams.get("q") ?? url.searchParams.get("url") ?? href;
    }
    if (host.endsWith("safelinks.protection.outlook.com")) return url.searchParams.get("url") ?? href;
    return href;
  } catch {
    return href;
  }
}

const isIp = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host);

function skeleton(label: string): string {
  return label
    .toLowerCase()
    .replace(/-/g, "")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/0/g, "o")
    .replace(/[1i|!]/g, "l")
    .replace(/5/g, "s")
    .replace(/3/g, "e");
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length]!;
}

export function isLookalike(hostOrDomain: string, officialDomain: string): boolean {
  const host = hostOrDomain.toLowerCase().replace(/^www\./, "");
  const domain = registrableDomain(host);
  const official = registrableDomain(officialDomain);
  if (!domain || domain === official) return false;
  const brand = skeleton(getDomainWithoutSuffix(official) ?? official.split(".")[0] ?? "");
  if (brand.length < 4) return false;
  const label = skeleton(getDomainWithoutSuffix(domain) ?? domain.split(".")[0] ?? "");
  if (label === brand || label.includes(brand)) return true;
  if (distance(label, brand) <= (brand.length >= 8 ? 2 : 1)) return true;
  const subdomains = skeleton(host.slice(0, Math.max(0, host.length - domain.length)).replace(/\./g, ""));
  return subdomains.includes(brand);
}

export function shownDomain(text: string): string | undefined {
  const match = text.trim().match(SHOWN_DOMAIN);
  if (!match?.[1]) return undefined;
  const domain = registrableDomain(match[1]);
  return domain.includes(".") ? domain : undefined;
}

export function analyzeLink(rawHref: string, text = "", ctx: LinkContext = {}): LinkCheck {
  const href = unwrapRedirect(rawHref.trim());
  const risks: LinkRisk[] = [];
  const reasons: string[] = [];
  const add = (risk: LinkRisk, reason: string) => {
    risks.push(risk);
    reasons.push(reason);
  };
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { href, host: "", domain: "", risks, reasons, level: "low" };
  }
  if (/^(javascript|data|vbscript|file|blob):$/i.test(url.protocol)) {
    add("script", "This isn't a website: it runs code or opens a hidden document");
    return { href, host: "", domain: "", risks, reasons, level: "high" };
  }
  if (!/^https?:$/.test(url.protocol)) return { href, host: "", domain: "", risks, reasons, level: "low" };
  const host = (getHostname(href) ?? url.hostname).toLowerCase();
  const domain = registrableDomain(host);
  const shown = shownDomain(text);
  if (ctx.trustedHosts?.includes(host) && !url.username && !url.password) return { href, host, domain, risks, reasons, level: "low" };
  const official = ctx.officialDomain ? registrableDomain(ctx.officialDomain) : undefined;
  const who = ctx.officialName ? `${ctx.officialName}'s` : "the sender's";

  if (url.username || url.password) add("userinfo", `Everything before "@" is a decoy: it really goes to ${host}`);
  if (host.split(".").some((part) => part.startsWith("xn--"))) add("punycode", "Uses look-alike foreign characters in the address");
  if (isIp(host)) add("ip_host", "Goes to a bare IP address, not a named website");
  if (shown && shown !== domain) {
    if (TRACKERS.has(domain)) add("tracker", `Shows ${shown} but passes through ${domain}, so the final stop is hidden`);
    else add("text_mismatch", `Shows ${shown} but actually goes to ${domain}`);
  }
  if (official && domain !== official && !KNOWN_PORTALS.has(domain)) {
    if (isLookalike(host, official)) add("lookalike", `${domain} imitates ${official}`);
    else if (!TRACKERS.has(domain)) add("not_official", `Not ${who} official site (${official})`);
  }
  if (SHORTENERS.has(domain)) add("shortener", "A link shortener hides where this really goes");
  if (FREE_HOSTS.has(domain) || FREE_HOSTS.has(host)) add("free_host", `${domain} is free hosting: anyone can put a page there`);
  if (DOWNLOAD_PATH.test(url.pathname)) add("download", "Downloads a file that can run code or hide one");

  const level: RiskLevel = risks.some((r) => HIGH.has(r)) ? "high" : risks.length ? "medium" : "low";
  return { href, host, domain, shownDomain: shown, risks, reasons, level };
}

export function analyzeAttachment(name: string): AttachmentCheck {
  const clean = name.trim();
  const ext = clean.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const disguised = /\.(pdf|docx?|xlsx?|jpe?g|png|txt)\.[a-z0-9]+$/i.test(clean);
  const lead = disguised ? `Disguised as a document, but it's really .${ext}. ` : "";
  if (RUNS_CODE.test(clean)) return { name: clean, ext, level: "high", reason: `${lead}Opening it runs a program on your computer` };
  if (OPENS_PAGE.test(clean)) return { name: clean, ext, level: "high", reason: `${lead}Opens a web page from your disk, a common way to show a fake sign-in form` };
  if (DISK_IMAGE.test(clean)) return { name: clean, ext, level: "high", reason: `${lead}Disk image, often used to slip programs past security checks` };
  if (MACROS.test(clean)) return { name: clean, ext, level: "high", reason: "Office file with macros: never click \"Enable content\"" };
  if (ARCHIVE.test(clean)) return { name: clean, ext, level: "medium", reason: "Archive: check what's inside before opening anything" };
  return { name: clean, ext, level: "low", reason: "" };
}

export const worstLevel = (levels: RiskLevel[]): RiskLevel =>
  levels.includes("high") ? "high" : levels.includes("medium") ? "medium" : "low";
