const TWO_PART = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "co.jp", "ne.jp", "or.jp", "com.au", "net.au", "org.au", "edu.au", "co.nz",
  "com.br", "com.mx", "com.ar", "com.tr", "com.cn", "com.hk", "com.sg", "com.tw", "co.in", "co.za", "co.kr", "co.il", "com.my", "com.ph",
  "github.io", "netlify.app", "vercel.app", "pages.dev", "web.app", "firebaseapp.com", "herokuapp.com", "blogspot.com", "workers.dev",
]);

export function siteOf(hostOrUrl: string): string {
  let host = hostOrUrl.toLowerCase();
  try {
    if (/^[a-z][a-z0-9+.-]*:/.test(host)) host = new URL(host).hostname;
  } catch {
    return host;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export const sameSite = (a: string, b: string) => siteOf(a) === siteOf(b);

export const normalizeLabel = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^[\s»›<>«‹(\[]+|[\s!.?…»›>)\]]+$/g, "")
    .trim()
    .toLowerCase();

const DISMISS_EXACT =
  /^(?:x|×|✕|✖|✗|╳|close|close ad|close this|close window|close x|cancel|dismiss|no|nope|no thanks|no, thanks|no thank you|not now|maybe later|later|skip|skip ad|skip this|decline|reject|reject all|back|go back|exit|stop|not interested|i'm not interested|i am not interested|no, take me back|continue without|unsubscribe)$/;
const DISMISS_WORDS = /\b(close|cancel|dismiss|no thanks|no, thanks|not now|skip|decline|reject|not interested|go back)\b/;
const DISMISS_HINT = /(^|[-_\s])(close|closer|dismiss|cancel|btn-x|icon-x|x-btn|modal-x)([-_\s]|btn|button|icon|$)/i;

export function isDismissLabel(label: string, hints = ""): boolean {
  const l = normalizeLabel(label);
  if (DISMISS_EXACT.test(l)) return true;
  if (l.length > 0 && l.length <= 28 && DISMISS_WORDS.test(l)) return true;
  return l.length <= 2 && DISMISS_HINT.test(hints);
}

export const isDownloadLabel = (label: string) => {
  const l = normalizeLabel(label);
  return l.length <= 40 && /\b(download|start download|download now|free download|get it now|install now|play now|watch now|stream now)\b/.test(l);
};

export const BAIT =
  /\b(click|press|tap|hit|select)\s+(on\s+)?["“'‘]?allow\b|verify (that )?you('re| are) (not a robot|a human|human)|\bnot a robot\b|to (continue|watch|download|play|access|verify)[^.\n]{0,50}\ballow\b/i;

const URL_IN_CODE = /https?:\/\/[^\s'"`)<>\\]+/g;

export function urlsInHandler(code: string | null | undefined): string[] {
  return [...new Set((code ?? "").match(URL_IN_CODE) ?? [])].slice(0, 5);
}

const NAV_IN_CODE = /(?:\bopen|\bassign|\breplace)\s*\(\s*["'`](https?:\/\/[^\s'"`)<>\\]+)|\blocation(?:\.href)?\s*=\s*["'`](https?:\/\/[^\s'"`)<>\\]+)/;

export function navTargetInCode(code: string | null | undefined): string | null {
  const m = (code ?? "").match(NAV_IN_CODE);
  return m?.[1] ?? m?.[2] ?? null;
}

export const isSamePageHref = (raw: string | null | undefined) => /^\s*(#|javascript:)/i.test(raw ?? "");

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const gapTo = (b: Box, x: number, y: number) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom));

export function nearestTrap<T extends { box: Box; big: boolean }>(items: readonly T[], x: number, y: number, radius: number, keep: T | null = null, slack = 16): T | null {
  let best: T | null = null;
  let bestScore = Infinity;
  let bestArea = Infinity;
  for (const it of items) {
    const g = gapTo(it.box, x, y);
    const bonus = it === keep ? slack : 0;
    if (it.big ? g > 0 : g > radius + bonus) continue;
    const score = it.big ? radius + 1 : Math.max(0, g - bonus);
    const area = (it.box.right - it.box.left) * (it.box.bottom - it.box.top);
    if (score < bestScore || (score === bestScore && area < bestArea)) {
      best = it;
      bestScore = score;
      bestArea = area;
    }
  }
  return best;
}

const SHOWN = /^\s*(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/?#:]\S*)?\s*$/i;

export function shownSite(label: string): string | null {
  const m = label.trim().match(SHOWN);
  return m?.[1] ? siteOf(m[1]) : null;
}

export interface ClickContext {
  label: string;
  hints: string;
  anchorHref?: string;
  looksClickable: boolean;
  overlay: boolean;
}

export type ReasonCode = "dismiss" | "overlay" | "extra" | "plain";

export type FlagKind = "dismiss" | "form" | "overlay" | "frame" | "decoy" | "mismatch" | "extra" | "lookalike" | "doc" | "learned";

export interface Verdict {
  block: boolean;
  level: "high" | "medium" | "none";
  reason: string;
  code?: ReasonCode;
  kind?: FlagKind;
}

const ALLOW: Verdict = { block: false, level: "none", reason: "" };
const quote = (label: string) => {
  const l = label.replace(/\s+/g, " ").trim();
  return l ? `“${l.length > 32 ? `${l.slice(0, 31)}…` : l}”` : "this button";
};

export function reasonFor(code: ReasonCode, label: string, to: string, from = ""): string {
  switch (code) {
    case "dismiss":
      return `${quote(label)} should close something, but it tried to take you to ${to}`;
    case "overlay":
      return `An invisible layer over the page caught your click and tried to open ${to}`;
    case "extra":
      return `The link goes to ${from || "this site"}, but clicking it also tried to open ${to}`;
    default:
      return `Clicking ordinary page content tried to open ${to}`;
  }
}

export function judgeOpen(dest: string, page: string, click: ClickContext | null): Verdict {
  if (!click || !/^https?:/i.test(dest)) return ALLOW;
  const to = siteOf(dest);
  if (to === siteOf(page)) return ALLOW;
  if (click.anchorHref && siteOf(click.anchorHref) === to) return ALLOW;
  const from = click.anchorHref ? siteOf(click.anchorHref) : "";
  const code: ReasonCode | null = isDismissLabel(click.label, click.hints)
    ? "dismiss"
    : click.overlay
      ? "overlay"
      : click.anchorHref
        ? "extra"
        : !click.looksClickable
          ? "plain"
          : null;
  return code ? { block: true, level: "high", code, reason: reasonFor(code, click.label, to, from) } : ALLOW;
}

export interface StaticCheck {
  label: string;
  hints: string;
  href?: string;
  handlerUrls: string[];
  overlay: boolean;
}

export function judgeElement(el: StaticCheck, page: string): Verdict {
  const pageSite = siteOf(page);
  const hrefSite = el.href && /^https?:/i.test(el.href) ? siteOf(el.href) : null;
  const foreignHandler = el.handlerUrls.map(siteOf).find((s) => s !== pageSite && s !== hrefSite);
  if (el.href && /^(data|vbscript):/i.test(el.href)) {
    return { block: true, level: "high", kind: "doc", reason: "This link opens a hidden document instead of a website" };
  }
  const dest = hrefSite && hrefSite !== pageSite ? hrefSite : (foreignHandler ?? null);
  if (dest && isDismissLabel(el.label, el.hints)) return { block: true, level: "high", kind: "dismiss", reason: `${quote(el.label)} looks like it closes something, but it takes you to ${dest}` };
  if (dest && el.overlay) return { block: true, level: "high", kind: "overlay", reason: `An invisible link laid over the page sends clicks to ${dest}` };
  const shown = shownSite(el.label);
  if (hrefSite && shown && shown !== hrefSite) return { block: true, level: "high", kind: "mismatch", reason: `Shows ${shown} but actually goes to ${hrefSite}` };
  if (el.href) {
    try {
      const u = new URL(el.href);
      if (/^https?:$/.test(u.protocol) && (u.username || u.password)) return { block: true, level: "high", kind: "mismatch", reason: `Everything before “@” is a decoy: it goes to ${u.hostname}` };
      if (/^https?:$/.test(u.protocol) && u.hostname.split(".").some((p) => p.startsWith("xn--"))) return { block: false, level: "medium", kind: "lookalike", reason: `Uses look-alike characters in the address (${u.hostname})` };
    } catch {
      return ALLOW;
    }
  }
  if (foreignHandler && hrefSite) return { block: false, level: "medium", kind: "extra", reason: `It links to ${hrefSite}, but clicking it also opens ${foreignHandler}` };
  return ALLOW;
}

export function downloadDecoys(items: { label: string; href?: string }[], page: string): Set<number> {
  const pageSite = siteOf(page);
  const downloads = items.map((it, i) => ({ i, site: it.href && /^https?:/i.test(it.href) ? siteOf(it.href) : null, dl: isDownloadLabel(it.label) })).filter((d) => d.dl && d.site);
  const sites = new Set(downloads.map((d) => d.site));
  if (downloads.length < 2 || sites.size < 2) return new Set();
  return new Set(downloads.filter((d) => d.site !== pageSite).map((d) => d.i));
}
