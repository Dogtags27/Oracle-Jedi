import {
  KNOWN_PORTALS,
  PERSONAL_EMAIL_DOMAINS,
  isLookalike,
  findPhones,
  stripMarkup,
  normalizePhone,
  registrableDomain,
  type CheckFact,
  type CheckRequest,
  type CheckResponse,
  type Evidence,
} from "@oj/core";
import { explainCheck, signalText } from "@oj/core/findings";
import { db } from "../db";
import { env } from "../env";
import { exaSearch, tavilyExtract, tavilySearch, type WebPage } from "./providers";

const DIRECTORIES = new Set([
  "yelp.com", "facebook.com", "linkedin.com", "bbb.org", "yellowpages.com", "mapquest.com", "indeed.com", "glassdoor.com",
  "wikipedia.org", "instagram.com", "x.com", "twitter.com", "youtube.com", "google.com", "apple.com", "angi.com",
  "thumbtack.com", "nextdoor.com", "manta.com", "bizapedia.com", "zoominfo.com", "dnb.com", "crunchbase.com", "reddit.com",
  "tiktok.com", "opencorporates.com", "chamberofcommerce.com", "birdeye.com", "expertise.com", "taxbuzz.com", "cpaverify.org",
  "trustpilot.com", "glassdoor.co.uk", "pitchbook.com", "bloomberg.com", "sec.gov", "irs.gov",
]);

const PORTAL_HINT = /portal|upload|secure|client|login|sharefile|taxdome|smartvault|canopy|verifyle|liscio|onvio|citrix/i;
const STOP = new Set(["the", "and", "of", "inc", "llc", "co", "company", "group", "services", "a"]);

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));

const ws = (s: string) => s.replace(/\s+/g, " ").trim();

const HIDDEN_EMAIL = "[email hidden by site]";

const unescapeMarkdown = (s: string) => s.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, "$1");

function quoteAround(text: string, needle: string, radius = 80): string | null {
  const lower = text.toLowerCase();
  const i = lower.indexOf(needle.toLowerCase());
  if (i < 0) return null;
  let lineStart = text.lastIndexOf("\n", i) + 1;
  let lineEnd = text.indexOf("\n", i + needle.length);
  if (lineEnd < 0) lineEnd = text.length;
  const hiddenBefore = lower.lastIndexOf(HIDDEN_EMAIL, i);
  if (hiddenBefore >= lineStart) lineStart = hiddenBefore + HIDDEN_EMAIL.length;
  const hiddenAfter = lower.indexOf(HIDDEN_EMAIL, i + needle.length);
  if (hiddenAfter >= 0 && hiddenAfter < lineEnd) lineEnd = hiddenAfter;
  let start = Math.max(lineStart, i - radius);
  let end = Math.min(lineEnd, i + needle.length + radius);
  while (start > lineStart && /\S/.test(text[start - 1])) start--;
  while (end < lineEnd && /\S/.test(text[end])) end++;
  return ws(text.slice(start, end)).slice(0, 260);
}

const contains = (haystack: string, quote: string) => ws(haystack).toLowerCase().includes(ws(quote).toLowerCase());

interface Discovery {
  officialDomain: string;
  officialName: string;
  pages: WebPage[];
  exaPages: WebPage[];
  providers: string[];
}

function pickOfficial(results: WebPage[], org: string): { domain: string; title: string } | null {
  const orgTokens = tokens(org);
  if (orgTokens.length === 0) return null;
  const scored = new Map<string, { score: number; matched: number; title: string }>();
  for (const r of results) {
    let host = "";
    try {
      host = new URL(r.url).hostname;
    } catch {
      continue;
    }
    const domain = registrableDomain(host);
    if (DIRECTORIES.has(domain)) continue;
    const label = domain.split(".")[0].replace(/-/g, "");
    const title = r.title.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const t of orgTokens) {
      const inLabel = label.includes(t);
      const inTitle = title.includes(t);
      if (inLabel) score += 3;
      if (inTitle) score += 1;
      if (inLabel || inTitle) matched++;
    }
    const prev = scored.get(domain);
    if (!prev || prev.score < score) scored.set(domain, { score, matched, title: r.title });
  }
  const needed = orgTokens.length <= 3 ? orgTokens.length : orgTokens.length - 1;
  const best = [...scored.entries()].filter(([, s]) => s.matched >= needed && s.score >= 3).sort((a, b) => b[1].score - a[1].score)[0];
  return best ? { domain: best[0], title: best[1].title } : null;
}

async function cached(key: string): Promise<Discovery | null> {
  const { data } = await db().from("check_cache").select("result, fetched_at").eq("org_key", key).maybeSingle();
  if (!data) return null;
  const ageH = (Date.now() - new Date(data.fetched_at).getTime()) / 3_600_000;
  return ageH < env.checkCacheTtlHours ? (data.result as Discovery) : null;
}

async function discover(org: string, locationHint: string | undefined, knownDomain: string | undefined, deadline: number, providers: string[]): Promise<Discovery | null> {
  const signal = () => AbortSignal.timeout(Math.max(500, deadline - Date.now()));
  let exaPages: WebPage[] = [];
  let official = knownDomain ? { domain: knownDomain, title: org } : null;
  const query = `${org}${locationHint ? ` ${locationHint}` : ""} official website contact`;
  if (!official && env.exaApiKey) {
    try {
      exaPages = await exaSearch(query, signal());
      providers.push("exa:search");
      official = pickOfficial(exaPages, org);
    } catch {
      providers.push("exa:failed");
    }
  }
  if (!official && env.tavilyApiKey) {
    try {
      const found = await tavilySearch(query, signal());
      providers.push("tavily:search");
      exaPages = exaPages.length ? exaPages : found;
      official = pickOfficial(found, org);
    } catch {
      providers.push("tavily:search_failed");
    }
  }
  if (!official) return null;
  const onDomain = exaPages.filter((p) => {
    try {
      return registrableDomain(new URL(p.url).hostname) === official!.domain;
    } catch {
      return false;
    }
  });
  const urls = [...new Set([`https://${official.domain}/`, ...onDomain.slice(0, 2).map((p) => p.url), `https://${official.domain}/contact`, `https://${official.domain}/contact-us`])].slice(0, 5);
  let pages: WebPage[] = [];
  if (env.tavilyApiKey) {
    try {
      pages = await tavilyExtract(urls, signal());
      providers.push("tavily:extract");
    } catch {
      providers.push("tavily:extract_failed");
    }
  }
  return {
    officialDomain: official.domain,
    officialName: official.title.split(/[|\-–·]/)[0].trim() || org,
    pages: pages.map((p) => ({ ...p, text: p.text.slice(0, 20000) })),
    exaPages: onDomain.map((p) => ({ ...p, text: p.text.slice(0, 6000) })),
    providers,
  };
}

async function registry(org: string, senderDomain: string) {
  const [byDomain, byName] = await Promise.all([
    senderDomain ? db().from("offices").select("*").eq("domain", senderDomain).maybeSingle() : Promise.resolve({ data: null }),
    org
      ? db()
          .from("offices")
          .select("*")
          .ilike("name", org.trim())
          .not("domain", "like", "%.test")
          .order("dns_verified_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return byDomain.data ?? byName.data;
}

export async function runCheck(req: CheckRequest): Promise<CheckResponse> {
  const started = Date.now();
  const deadline = started + env.checkTimeoutMs;
  const senderDomain = req.senderDomain ? registrableDomain(req.senderDomain) : "";
  const senderEmail = (req.senderEmail ?? "").toLowerCase();
  const isPersonal = PERSONAL_EMAIL_DOMAINS.has(senderDomain);
  const facts: CheckFact[] = [];
  const evidence: Evidence[] = [];
  const now = () => new Date().toISOString();

  const key = `${req.claimedOrg.trim().toLowerCase()}|${(req.locationHint ?? "").trim().toLowerCase()}`;
  const [office, plainCache] = await Promise.all([registry(req.claimedOrg, isPersonal ? "" : senderDomain), cached(key)]);
  let source: CheckResponse["source"] = office ? "registry" : "live";
  const providersUsed: string[] = [];
  let found = office ? await cached(`registry:${office.domain}`) : plainCache;
  if (found) source = office ? "registry" : "cache";
  else {
    found = await discover(req.claimedOrg, req.locationHint, office?.domain, deadline, providersUsed);
    if (found && found.pages.length) {
      await db().from("check_cache").upsert({ org_key: office ? `registry:${office.domain}` : key, result: found, fetched_at: now() });
    }
  }

  if (office) {
    evidence.push({
      url: `${env.publicAppUrl.replace(/\/$/, "")}/office-registry/${office.domain}`,
      quote: `${office.name} · official domain ${office.domain} · ${office.dns_verified_at ? "DNS-verified" : "registered"} key ${office.fingerprint.slice(0, 16)}`,
      verified: Boolean(office.dns_verified_at),
      fetchedAt: now(),
      source: "registry",
    });
  }

  const officialDomain = office?.domain ?? found?.officialDomain;
  const rawAll = (found?.pages ?? []).map((p) => p.text).join("\n");
  const pages = (found?.pages ?? []).map((p) => ({ ...p, text: stripMarkup(unescapeMarkdown(p.text)) }));
  const all = pages.map((p) => p.text).join("\n");
  const exaText = stripMarkup((found?.exaPages ?? []).map((p) => p.text).join("\n"));
  const emailsOnSite = [...new Set((all.match(/[\w.+-]+@[\w-]+(\.[a-z]{2,})+/gi) ?? []).map((e) => e.toLowerCase()))];
  const phonesOnSite = findPhones(all);
  const officialPhone = phonesOnSite[0];

  const addQuote = (needle: string | undefined) => {
    if (!needle) return false;
    for (const p of pages) {
      const quote = quoteAround(p.text, needle);
      if (quote && !evidence.some((e) => e.quote.slice(0, 60) === quote.slice(0, 60))) {
        evidence.push({ url: p.url, quote, verified: contains(p.text, quote), fetchedAt: now(), source: "tavily", corroborated: exaText ? contains(exaText, quote) : undefined });
        return true;
      }
    }
    return false;
  };

  const emailListed = Boolean(senderEmail && emailsOnSite.includes(senderEmail));
  const domainOfficial = Boolean(officialDomain && senderDomain && !isPersonal && (senderDomain === officialDomain || emailsOnSite.some((e) => registrableDomain(e.split("@")[1]) === senderDomain)));
  if (emailListed) addQuote(senderEmail);
  else addQuote(emailsOnSite.find((e) => registrableDomain(e.split("@")[1]) === officialDomain) ?? emailsOnSite[0]);

  const phoneHits = req.phones.filter((p) => phonesOnSite.some((s) => normalizePhone(s) === normalizePhone(p)));
  if (phoneHits.length) {
    addQuote(phonesOnSite.find((s) => normalizePhone(s) === normalizePhone(phoneHits[0])));
    facts.push({ code: "phone_match" });
  } else if (officialPhone) addQuote(officialPhone);

  const orgWord = tokens(req.claimedOrg).sort((a, b) => b.length - a.length)[0];
  if (evidence.filter((e) => e.source === "tavily").length < 2) addQuote(orgWord);

  const webEvidence = evidence.filter((e) => e.source !== "registry" && e.verified).length;
  const registryDecisive = Boolean(office?.dns_verified_at);
  let verdict: CheckResponse["verdict"] = "unknown";
  if (officialDomain && (emailListed || domainOfficial)) verdict = "verified";
  else if (officialDomain && senderDomain && (webEvidence > 0 || registryDecisive)) verdict = "mismatch";

  const domainVar = officialDomain ?? "";
  if (verdict === "mismatch") {
    facts.unshift({ code: "sender_absent", vars: { sender: senderEmail || senderDomain, domain: domainVar } });
    if (isPersonal) facts.push({ code: "personal_email" });
    if (req.phones.length && !phoneHits.length && phonesOnSite.length) facts.push({ code: "phone_not_on_site" });
  }
  const lookalike = (d: string) => Boolean(officialDomain && isLookalike(d, officialDomain));
  if (senderDomain && lookalike(senderDomain)) facts.splice(1, 0, { code: "sender_lookalike", vars: { sender: senderDomain, domain: domainVar } });
  for (const d of req.linkDomains) {
    if (!officialDomain || d === officialDomain || KNOWN_PORTALS.has(d)) continue;
    facts.push({ code: lookalike(d) ? "link_lookalike" : "link_elsewhere", vars: { link: d, domain: domainVar } });
  }
  if (office && !office.dns_verified_at) facts.push({ code: "registry_unverified", vars: { name: office.name } });
  if (!officialDomain) facts.push({ code: "no_official_site" });
  const seen = new Set<string>();
  const uniqueFacts = facts.filter((f) => {
    const text = signalText(f, "en");
    return !seen.has(text) && Boolean(seen.add(text));
  });
  const sender = req.senderEmail || req.senderDomain || undefined;

  const portal = (rawAll.match(/https?:\/\/[^\s)\]"'<>]+/g) ?? []).find((u) => PORTAL_HINT.test(u));
  return {
    verdict,
    claimedOrg: req.claimedOrg,
    officialName: office?.name ?? req.claimedOrg,
    officialDomain,
    officialUploadUrl: portal,
    officialPhone,
    officialVerifiedByDns: office ? Boolean(office.dns_verified_at) : undefined,
    evidence: evidence.slice(0, 5),
    signals: uniqueFacts.map((f) => signalText(f, "en")),
    explanation: explainCheck({ verdict, claimedOrg: req.claimedOrg, sender, officialDomain, officialPhone }, "en"),
    facts: uniqueFacts,
    sender,
    latencyMs: Date.now() - started,
    source,
    providers: found?.providers ?? providersUsed,
  };
}
