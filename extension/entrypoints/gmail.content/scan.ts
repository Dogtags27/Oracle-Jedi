import type { CheckResponse } from "@oj/core";
import { KNOWN_PORTALS, analyzeAttachment, analyzeLink, type AttachmentCheck, type LinkCheck, type LinkContext } from "@oj/core/links";
import { extractRequest, type ExtractedRequest } from "@oj/core/request";
import { APP_URL } from "@/lib/api";

const APP_HOST = new URL(APP_URL).host;
const OWN: LinkContext = { trustedHosts: [APP_HOST] };
const isOwnLink = (href: string) => {
  try {
    return new URL(href).host === APP_HOST;
  } catch {
    return false;
  }
};

export interface LinkInfo {
  href: string;
  text: string;
}

export interface Scan {
  from: string;
  senderEmail: string;
  request: ExtractedRequest;
  links: LinkInfo[];
  attachments: AttachmentCheck[];
  flagged: boolean;
}

export const BODY = "div.a3s";

const unique = <T>(items: T[]) => [...new Set(items)];

function readAttachments(root: Element): string[] {
  const fromAttr = [...root.querySelectorAll("[download_url]")].map((el) => el.getAttribute("download_url")?.split(":")[1] ?? "");
  const fromLabel = [...root.querySelectorAll(".aV3, .aQA span")].map((el) => el.textContent ?? "");
  return unique([...fromAttr, ...fromLabel].map((n) => n.trim()).filter((n) => /\.[a-z0-9]{2,5}$/i.test(n)));
}

export function messageRoot(body: HTMLElement): HTMLElement {
  return (body.closest(".adn") ?? body.closest(".gs") ?? body.parentElement ?? body) as HTMLElement;
}

export function scanMessage(body: HTMLElement): Scan {
  const root = messageRoot(body);
  const sender = root.querySelector<HTMLElement>(".gD[email]") ?? root.querySelector<HTMLElement>("[email]");
  const senderEmail = sender?.getAttribute("email") ?? "";
  const name = sender?.getAttribute("name") ?? sender?.textContent ?? "";
  const from = senderEmail ? `${name} <${senderEmail}>` : name;
  const links = [...body.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .filter((a) => !/^(mailto|tel):/i.test(a.getAttribute("href") ?? ""))
    .map((a) => ({ href: a.href, text: (a.innerText || a.textContent || "").trim() }));
  const hrefs = links.filter((l) => !isOwnLink(l.href)).map((l) => analyzeLink(l.href).href).filter((h) => /^https?:/i.test(h));
  const text = links.filter((l) => isOwnLink(l.href) && l.text).reduce((t, l) => t.split(l.text).join(" "), body.innerText);
  const request = extractRequest(`${text}\n${hrefs.join("\n")}`, from);
  const attachments = readAttachments(root).map(analyzeAttachment).filter((a) => a.level !== "low");
  const flagged =
    request.isDocumentRequest ||
    request.isCredentialRequest ||
    links.some((l) => analyzeLink(l.href, l.text, OWN).level === "high") ||
    attachments.some((a) => a.level === "high");
  return { from, senderEmail, request, links, attachments, flagged };
}

export function linkContext(result?: CheckResponse | null): LinkContext {
  if (!result?.officialDomain || result.verdict === "unknown") return OWN;
  return { ...OWN, officialDomain: result.officialDomain, officialName: result.officialName ?? result.claimedOrg };
}

export function guardLevel(check: LinkCheck, flagged: boolean): "high" | "medium" | "" {
  if (check.level === "high") return "high";
  if (check.level === "medium" && flagged && !KNOWN_PORTALS.has(check.domain)) return "medium";
  return "";
}

export function riskyLinks(scan: Scan, result?: CheckResponse | null) {
  const ctx = linkContext(result);
  const flagged = scan.flagged || result?.verdict === "mismatch";
  const seen = new Set<string>();
  return scan.links
    .map((l) => analyzeLink(l.href, l.text, ctx))
    .filter((c) => guardLevel(c, flagged) && !seen.has(c.href) && seen.add(c.href));
}
