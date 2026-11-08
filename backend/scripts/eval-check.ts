import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PERSONAL_EMAIL_DOMAINS, normalizePhone, registrableDomain, type CheckRequest, type CheckResponse, type Verdict } from "@oj/core";
import { env } from "../src/env";
import { db } from "../src/db";
import { runCheck } from "../src/check/engine";

type Kind = "official sender" | "free email" | "no website" | "demo office";

interface Case {
  id: string;
  kind: Kind;
  expected: Verdict;
  req: CheckRequest;
  note?: string;
  skipped?: string;
}

interface Call {
  host: string;
  body: string;
}

interface Run {
  ms: number;
  response?: CheckResponse;
  error?: string;
  exaCalls: number;
  tavilyCalls: number;
  dbCalls: number;
  otherCalls: number;
  leaks: string[];
  providerRequests: number;
  skipped?: string;
}

interface Citation {
  caseId: string;
  url: string;
  quote: string;
  engineVerified: boolean;
  status: "valid" | "invalid" | "unreachable" | "not applicable";
  match?: "exact" | "spacing";
  reason?: string;
  httpStatus?: number;
}

const MAX_LIVE_CHECKS = 25;
const VERDICTS: Verdict[] = ["verified", "mismatch", "unknown"];
const UA = "Mozilla/5.0 (compatible; OracleJediEval/1.0; citation re-check)";
const OUT_DIR = fileURLToPath(new URL("../../evals/results/", import.meta.url));

const officialSender = (id: string, claimedOrg: string, senderDomain: string, note?: string): Case => ({
  id,
  kind: "official sender",
  expected: "verified",
  req: { claimedOrg, senderDomain, linkDomains: [], phones: [] },
  note,
});

const freeEmail = (id: string, claimedOrg: string, provider: string, extra: Partial<CheckRequest> = {}): Case => ({
  id,
  kind: "free email",
  expected: "mismatch",
  req: { claimedOrg, senderDomain: provider, senderEmail: `oj-eval-${id.toLowerCase()}@${provider}`, linkDomains: [], phones: [], ...extra },
});

const noWebsite = (id: string, claimedOrg: string, senderDomain: string, senderEmail?: string): Case => ({
  id,
  kind: "no website",
  expected: "unknown",
  req: { claimedOrg, senderDomain, senderEmail, linkDomains: [], phones: [] },
  note: "fictional organization",
});

const CASES: Case[] = [
  officialSender("V01", "H&R Block", "hrblock.com", "national tax-prep chain"),
  officialSender("V02", "Jackson Hewitt", "jacksonhewitt.com", "national tax-prep chain"),
  officialSender("V03", "ADP", "adp.com", "payroll"),
  officialSender("V04", "Paychex", "paychex.com", "payroll"),
  officialSender("V05", "Charles Schwab", "schwab.com", "brokerage"),
  officialSender("V06", "Fidelity Investments", "fidelity.com", "brokerage"),
  officialSender("V07", "Wells Fargo", "notify.wellsfargo.com", "bank; sender on a subdomain"),
  officialSender("V08", "Arizona State University", "asu.edu", "university; acronym domain"),
  freeEmail("M01", "H&R Block", "gmail.com", { phones: ["(202) 555-0142"] }),
  freeEmail("M02", "Jackson Hewitt", "outlook.com"),
  freeEmail("M03", "ADP", "yahoo.com", { linkDomains: ["forms.gle"] }),
  freeEmail("M04", "Charles Schwab", "gmail.com"),
  freeEmail("M05", "Wells Fargo", "outlook.com", { phones: ["(415) 555-0199"] }),
  freeEmail("M06", "Arizona State University", "gmail.com"),
  noWebsite("U01", "Quillstead & Varnholt Tax Bureau", "gmail.com", "oj-eval-u01@gmail.com"),
  noWebsite("U02", "Brindlecove Payroll Collective", "brindlecove-payroll.example", "payroll@brindlecove-payroll.example"),
  noWebsite("U03", "Orrinvale Thistlebrook Academy", "yahoo.com", "oj-eval-u03@yahoo.com"),
];

interface Office {
  domain: string;
  name: string;
  dns_verified_at: string | null;
}

async function demoCases(): Promise<Case[]> {
  const domain = env.demoOfficeDomain.toLowerCase();
  let office: Office | null = null;
  let reason = "DEMO_OFFICE_DOMAIN is not set";
  if (domain) {
    const { data } = await db().from("offices").select("domain,name,dns_verified_at").eq("domain", domain).maybeSingle();
    office = (data as Office | null) ?? null;
    reason = office ? "" : `${domain} is not in the office registry`;
  }
  const name = office?.name ?? "Maple Street Tax";
  return [
    {
      id: "D01",
      kind: "demo office",
      expected: "verified",
      req: { claimedOrg: name, senderDomain: office?.domain ?? domain, linkDomains: [], phones: [] },
      note: "fictional demo office, sender on its real domain",
      skipped: reason || undefined,
    },
    {
      id: "D02",
      kind: "demo office",
      expected: "mismatch",
      req: { claimedOrg: name, senderDomain: "gmail.com", senderEmail: "maplestreet.tax.help@gmail.com", linkDomains: ["maple-street-taxdocs.co"], phones: [] },
      note: "fictional demo office, Gmail sender with a fictional upload link",
      skipped: reason || undefined,
    },
  ];
}

let calls: Call[] = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  calls.push({ host, body: typeof init?.body === "string" ? init.body : "" });
  return realFetch(input, init);
}) as typeof fetch;

const supabaseHost = (() => {
  try {
    return new URL(env.supabaseUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
})();

const isExa = (h: string) => h === "exa.ai" || h.endsWith(".exa.ai");
const isTavily = (h: string) => h === "tavily.com" || h.endsWith(".tavily.com");

function leaksIn(c: Case, body: string, officialDomain?: string): string[] {
  const b = body.toLowerCase();
  const found: string[] = [];
  const email = c.req.senderEmail?.toLowerCase();
  if (email && b.includes(email)) found.push("sender email");
  const local = email?.split("@")[0];
  if (local && local.length >= 4 && !c.req.claimedOrg.toLowerCase().includes(local) && b.includes(local)) found.push("sender email local part");
  const sender = c.req.senderDomain ? registrableDomain(c.req.senderDomain) : "";
  if (sender && sender !== officialDomain && b.includes(sender)) found.push(PERSONAL_EMAIL_DOMAINS.has(sender) ? "sender mail provider" : "sender domain");
  for (const p of c.req.phones) if (b.includes(p.toLowerCase()) || b.includes(normalizePhone(p))) found.push("phone number");
  return found;
}

const orgKey = (r: CheckRequest) => `${r.claimedOrg.trim().toLowerCase()}|${(r.locationHint ?? "").trim().toLowerCase()}`;

let offices: Office[] = [];

function cacheKeys(r: CheckRequest): string[] {
  const sender = r.senderDomain ? registrableDomain(r.senderDomain) : "";
  const personal = PERSONAL_EMAIL_DOMAINS.has(sender);
  const hits = offices.filter((o) => (!personal && sender && o.domain === sender) || (!o.domain.endsWith(".test") && o.name.trim().toLowerCase() === r.claimedOrg.trim().toLowerCase()));
  return [orgKey(r), ...hits.map((o) => `registry:${o.domain}`)];
}

async function isCached(r: CheckRequest): Promise<boolean> {
  const { data } = await db().from("check_cache").select("org_key").in("org_key", cacheKeys(r));
  return Boolean(data && data.length);
}

async function clearCache(r: CheckRequest) {
  const { error } = await db().from("check_cache").delete().in("org_key", cacheKeys(r));
  if (error) throw new Error(`could not clear check_cache: ${error.message}`);
}

async function runOne(c: Case): Promise<Run> {
  calls = [];
  const started = performance.now();
  let response: CheckResponse | undefined;
  let error: string | undefined;
  try {
    response = await runCheck(c.req);
  } catch (e) {
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
  const ms = Math.round(performance.now() - started);
  const made = calls;
  calls = [];
  const provider = made.filter((x) => isExa(x.host) || isTavily(x.host));
  return {
    ms,
    response,
    error,
    exaCalls: made.filter((x) => isExa(x.host)).length,
    tavilyCalls: made.filter((x) => isTavily(x.host)).length,
    dbCalls: made.filter((x) => x.host === supabaseHost).length,
    otherCalls: made.filter((x) => x.host !== supabaseHost && !isExa(x.host) && !isTavily(x.host)).length,
    leaks: [...new Set(provider.flatMap((x) => leaksIn(c, x.body, response?.officialDomain)))],
    providerRequests: provider.length,
  };
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”",
  ldquo: "“", ndash: "–", mdash: "—", hellip: "…", copy: "©", reg: "®", trade: "™",
  middot: "·", bull: "•", rarr: "→", larr: "←", laquo: "«", raquo: "»",
};

const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith("#")) {
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const MARKDOWN_CHARS = /[#*_>`|]+/g;
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const pageText = (html: string) =>
  squash(
    decode(
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ).replace(MARKDOWN_CHARS, " "),
  );

const quoteText = (q: string) => squash(q.replace(MARKDOWN_CHARS, " "));

const BOT_WALL = /captcha|access denied|are you a (robot|human)|attention required|just a moment\.\.\.|request unsuccessful|incapsula|px-captcha|verify you are (a )?human|pardon our interruption|bot detection/i;

interface Fetched {
  ok: boolean;
  status: number;
  text: string;
  error?: string;
}

const fetchedPages = new Map<string, Promise<Fetched>>();

function refetch(url: string): Promise<Fetched> {
  let p = fetchedPages.get(url);
  if (!p) {
    p = (async () => {
      try {
        const res = await realFetch(url, {
          headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
        const body = await res.text();
        return { ok: res.ok, status: res.status, text: pageText(body) };
      } catch (e) {
        const err = e as { name?: string; message?: string; cause?: { code?: string } };
        return { ok: false, status: 0, text: "", error: err.cause?.code ?? err.name ?? err.message ?? "fetch failed" };
      }
    })();
    fetchedPages.set(url, p);
  }
  return p;
}

async function checkCitation(caseId: string, e: CheckResponse["evidence"][number]): Promise<Citation> {
  const base = { caseId, url: e.url, quote: e.quote, engineVerified: e.verified };
  if (e.source === "registry") return { ...base, status: "not applicable", reason: "registry record, not a web page" };
  const page = await refetch(e.url);
  if (!page.ok) return { ...base, status: "unreachable", httpStatus: page.status || undefined, reason: page.error ?? `HTTP ${page.status}` };
  const q = quoteText(e.quote);
  if (page.text.includes(q)) return { ...base, status: "valid", match: "exact", httpStatus: page.status };
  if (page.text.replace(/ /g, "").includes(q.replace(/ /g, ""))) return { ...base, status: "valid", match: "spacing", httpStatus: page.status };
  if (BOT_WALL.test(page.text) && page.text.length < 5000) return { ...base, status: "unreachable", httpStatus: page.status, reason: "bot challenge page" };
  if (page.text.length < 1500) return { ...base, status: "unreachable", httpStatus: page.status, reason: `JavaScript-rendered page (${page.text.length} chars of static text)` };
  return { ...base, status: "invalid", httpStatus: page.status, reason: `quote not found in the re-fetched static HTML (${page.text.length} chars of text)` };
}

const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))] ?? null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtMs = (v: number | null) => (v === null ? "n/a" : `${v.toLocaleString("en-US")} ms`);
const pctStr = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "n/a");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function citationStats(list: Citation[]) {
  const web = list.filter((x) => x.status !== "not applicable");
  const unique = [...new Map(web.map((x) => [`${x.url}\n${x.quote}`, x] as const)).values()];
  const count = (xs: Citation[]) => {
    const valid = xs.filter((x) => x.status === "valid").length;
    const invalid = xs.filter((x) => x.status === "invalid").length;
    return {
      total: xs.length,
      valid,
      validSpacingOnly: xs.filter((x) => x.match === "spacing").length,
      invalid,
      unreachable: xs.filter((x) => x.status === "unreachable").length,
      reachable: valid + invalid,
      validOfReachable: valid + invalid ? valid / (valid + invalid) : null,
    };
  };
  return { ...count(web), unique: count(unique), engineFlaggedVerified: web.filter((x) => x.engineVerified).length };
}

async function evaluate() {
  const { data: officeRows } = await db().from("offices").select("domain,name,dns_verified_at");
  offices = (officeRows as Office[] | null) ?? [];
  const cases = [...CASES, ...(await demoCases())];
  const runnable = cases.filter((c) => !c.skipped);
  let liveChecks = 0;

  console.log(`EV1 check-engine eval · ${runnable.length} cases (${cases.length - runnable.length} skipped) · timeout ${env.checkTimeoutMs} ms · providers exa=${Boolean(env.exaApiKey)} tavily=${Boolean(env.tavilyApiKey)}`);
  console.log("\nPass 1 (live, cache cleared before each case)");
  const live = new Map<string, Run>();
  for (const c of runnable) {
    if (liveChecks >= MAX_LIVE_CHECKS) {
      live.set(c.id, { ms: 0, exaCalls: 0, tavilyCalls: 0, dbCalls: 0, otherCalls: 0, leaks: [], providerRequests: 0, skipped: "live-check budget reached" });
      continue;
    }
    await clearCache(c.req);
    const r = await runOne(c);
    liveChecks++;
    live.set(c.id, r);
    const v = r.response?.verdict ?? "CRASH";
    console.log(`  ${c.id} ${c.req.claimedOrg} <- ${c.req.senderEmail ?? c.req.senderDomain}: ${v} (expected ${c.expected}) · ${r.ms} ms · ${r.response?.source ?? "-"} · ${r.response?.officialDomain ?? "no official domain"} · [${r.response?.providers.join(", ") ?? r.error}]`);
  }

  const rtts: number[] = [];
  for (let i = 0; i < 7; i++) {
    const t0 = performance.now();
    await db().from("check_cache").select("org_key").limit(1);
    rtts.push(Math.round(performance.now() - t0));
  }
  const supabaseRtt = pct(rtts, 50);

  console.log(`\nSupabase round-trip from this machine: median ${supabaseRtt} ms`);
  console.log("\nPass 2 (same cases, cache warm)");
  const warm = new Map<string, Run>();
  for (const c of runnable) {
    if (live.get(c.id)?.skipped) continue;
    const cachedBefore = await isCached(c.req);
    if (!cachedBefore && liveChecks >= MAX_LIVE_CHECKS) {
      warm.set(c.id, { ms: 0, exaCalls: 0, tavilyCalls: 0, dbCalls: 0, otherCalls: 0, leaks: [], providerRequests: 0, skipped: "not cached and live-check budget reached" });
      console.log(`  ${c.id} skipped (not cached, budget reached)`);
      continue;
    }
    const r = await runOne(c);
    if (r.response?.source === "live" || r.exaCalls + r.tavilyCalls > 0) liveChecks++;
    warm.set(c.id, r);
    console.log(`  ${c.id} ${r.response?.verdict ?? "CRASH"} · ${r.ms} ms · ${r.response?.source ?? "-"} · provider calls ${r.exaCalls + r.tavilyCalls}`);
  }

  console.log("\nRe-fetching every cited page to check quotes independently");
  const citations: Citation[] = [];
  for (const c of runnable) {
    const r = live.get(c.id);
    for (const e of r?.response?.evidence ?? []) citations.push(await checkCitation(c.id, e));
  }

  const scored = runnable.filter((c) => live.get(c.id)?.response || live.get(c.id)?.error);
  const actualOf = (c: Case) => live.get(c.id)?.response?.verdict ?? "crash";
  const correct = scored.filter((c) => actualOf(c) === c.expected).length;
  const falseVerified = scored.filter((c) => actualOf(c) === "verified" && c.expected !== "verified");
  const crashes = scored.filter((c) => live.get(c.id)?.error);
  const confusion = Object.fromEntries(
    VERDICTS.map((exp) => [exp, Object.fromEntries([...VERDICTS, "crash"].map((act) => [act, scored.filter((c) => c.expected === exp && actualOf(c) === act).length]))]),
  ) as Record<Verdict, Record<string, number>>;

  const liveRuns = scored.map((c) => live.get(c.id)!).filter((r) => r.response);
  const liveMs = liveRuns.map((r) => r.ms);
  const warmRuns = [...warm.values()].filter((r) => r.response);
  const cachedRuns = warmRuns.filter((r) => r.response!.source !== "live" && r.exaCalls + r.tavilyCalls === 0);
  const uncachedWarm = runnable.filter((c) => {
    const r = warm.get(c.id);
    return r?.response && (r.response.source === "live" || r.exaCalls + r.tavilyCalls > 0);
  });
  const cachedMs = cachedRuns.map((r) => r.ms);
  const verdictDrift = runnable.filter((c) => warm.get(c.id)?.response && live.get(c.id)?.response && warm.get(c.id)!.response!.verdict !== live.get(c.id)!.response!.verdict);

  const providerCalls = liveRuns.map((r) => r.exaCalls + r.tavilyCalls);
  const providerTally: Record<string, number> = {};
  for (const r of liveRuns) for (const p of r.response!.providers) providerTally[p] = (providerTally[p] ?? 0) + 1;
  const providerRequests = [...live.values(), ...warm.values()].reduce((a, r) => a + r.providerRequests, 0);
  const leakCases = runnable.filter((c) => (live.get(c.id)?.leaks.length ?? 0) + (warm.get(c.id)?.leaks.length ?? 0) > 0);

  const metrics = {
    casesTotal: cases.length,
    casesRun: scored.length,
    casesSkipped: cases.filter((c) => c.skipped).map((c) => ({ id: c.id, reason: c.skipped })),
    accuracy: { correct, total: scored.length, rate: scored.length ? correct / scored.length : null },
    falseVerified: falseVerified.map((c) => c.id),
    crashes: crashes.map((c) => ({ id: c.id, error: live.get(c.id)?.error })),
    confusion,
    citations: citationStats(citations),
    latency: {
      liveP50: pct(liveMs, 50),
      liveP95: pct(liveMs, 95),
      liveN: liveMs.length,
      cachedP50: pct(cachedMs, 50),
      cachedP95: pct(cachedMs, 95),
      cachedN: cachedMs.length,
      cachedUnder200ms: cachedMs.filter((m) => m < 200).length,
      supabaseRoundTripMedian: supabaseRtt,
      notCacheable: uncachedWarm.map((c) => c.id),
    },
    calls: {
      providerCallsPerLiveCheck: { mean: mean(providerCalls), min: Math.min(...providerCalls), max: Math.max(...providerCalls) },
      exaPerLiveCheck: mean(liveRuns.map((r) => r.exaCalls)),
      tavilyPerLiveCheck: mean(liveRuns.map((r) => r.tavilyCalls)),
      supabasePerLiveCheck: mean(liveRuns.map((r) => r.dbCalls)),
      supabasePerCachedCheck: mean(cachedRuns.map((r) => r.dbCalls)),
      providerTally,
      liveChecksUsed: liveChecks,
      liveCheckBudget: MAX_LIVE_CHECKS,
    },
    privacy: { providerRequests, casesWithSenderDataSentToProviders: leakCases.map((c) => ({ id: c.id, leaks: [...new Set([...(live.get(c.id)?.leaks ?? []), ...(warm.get(c.id)?.leaks ?? [])])] })) },
    verdictDriftBetweenPasses: verdictDrift.map((c) => c.id),
  };

  const generatedAt = new Date().toISOString();
  const json = {
    eval: "EV1 check engine",
    generatedAt,
    config: { checkTimeoutMs: env.checkTimeoutMs, checkCacheTtlHours: env.checkCacheTtlHours, exa: Boolean(env.exaApiKey), tavily: Boolean(env.tavilyApiKey), demoOfficeDomain: env.demoOfficeDomain || null, maxLiveChecks: MAX_LIVE_CHECKS },
    metrics,
    cases: cases.map((c) => {
      const l = live.get(c.id);
      const w = warm.get(c.id);
      return {
        id: c.id,
        kind: c.kind,
        note: c.note,
        skipped: c.skipped ?? l?.skipped,
        request: c.req,
        expected: c.expected,
        actual: l?.response?.verdict ?? (l?.error ? "crash" : null),
        correct: l?.response ? l.response.verdict === c.expected : l?.error ? false : null,
        live: l ? { ms: l.ms, error: l.error, exaCalls: l.exaCalls, tavilyCalls: l.tavilyCalls, supabaseCalls: l.dbCalls, otherCalls: l.otherCalls, providerLeaks: l.leaks, response: l.response } : null,
        cached: w ? { ms: w.ms, skipped: w.skipped, error: w.error, source: w.response?.source, verdict: w.response?.verdict, exaCalls: w.exaCalls, tavilyCalls: w.tavilyCalls, supabaseCalls: w.dbCalls, providerLeaks: w.leaks } : null,
        citations: citations.filter((x) => x.caseId === c.id),
      };
    }),
  };


  console.log(`\naccuracy ${correct}/${scored.length} · false verified ${falseVerified.length} · crashes ${crashes.length}`);
  console.log(`citations ${metrics.citations.unique.valid}/${metrics.citations.unique.reachable} unique quotes valid (${metrics.citations.unique.unreachable} unreachable, ${metrics.citations.unique.invalid} invalid)`);
  console.log(`live p50/p95 ${metrics.latency.liveP50}/${metrics.latency.liveP95} ms · cached p50/p95 ${metrics.latency.cachedP50}/${metrics.latency.cachedP95} ms`);
  return json;
}

type Report = Awaited<ReturnType<typeof evaluate>>;

function render(report: Report): string {
  const m = report.metrics;
  const timeout = report.config.checkTimeoutMs;
  const all = report.cases.flatMap((c) => c.citations);
  const cs = citationStats(all);
  const u = cs.unique;
  const lines: string[] = [];
  const push = (...xs: string[]) => lines.push(...xs);
  const ran = m.accuracy.total;
  const leaks = m.privacy.casesWithSenderDataSentToProviders;
  const calls = m.calls.providerCallsPerLiveCheck;
  const rank = Math.ceil(0.95 * m.latency.liveN);

  push(`# EV1 · Check engine golden set`, "");
  push(`Run ${report.generatedAt.replace("T", " ").slice(0, 16)} UTC · ${ran} cases run, ${m.casesSkipped.length} skipped · engine timeout ${timeout} ms · one case at a time · ${m.calls.liveChecksUsed} live checks used (budget ${m.calls.liveCheckBudget})`, "");
  push(`| Metric | Measured | Target |`, `|---|---|---|`);
  push(`| Verdict accuracy | **${m.accuracy.correct}/${ran}** (${pctStr(m.accuracy.correct, ran)}) | high |`);
  push(`| False "verified" | **${m.falseVerified.length}**${m.falseVerified.length ? ` (${m.falseVerified.join(", ")})` : ""} | 0 |`);
  push(`| Crashes | ${m.crashes.length} | 0 |`);
  push(`| Citation validity, independent re-fetch | **${u.valid}/${u.reachable}** unique quotes found on the live page (${pctStr(u.valid, u.reachable)}); ${cs.valid}/${cs.reachable} counting every evidence item · ${u.unreachable ? `${u.unreachable} more unreachable by plain fetch` : "none unreachable"} | 100% |`);
  push(`| Live latency p50 / p95 | ${fmtMs(m.latency.liveP50)} / ${fmtMs(m.latency.liveP95)} (n=${m.latency.liveN}) | under the ${timeout} ms engine budget |`);
  push(`| Cached latency p50 / p95 | ${fmtMs(m.latency.cachedP50)} / ${fmtMs(m.latency.cachedP95)} (n=${m.latency.cachedN}, ${m.latency.cachedUnder200ms} under 200 ms) | < 200 ms |`);
  push(`| External API calls per live check | ${calls.mean.toFixed(1)} (min ${calls.min}, max ${calls.max}): Exa ${m.calls.exaPerLiveCheck.toFixed(1)}, Tavily ${m.calls.tavilyPerLiveCheck.toFixed(1)} | |`);
  push(`| External API calls per cached check | 0, plus ${m.calls.supabasePerCachedCheck.toFixed(1)} sequential Supabase round-trips (median ${fmtMs(m.latency.supabaseRoundTripMedian)} each from the eval machine) | 0 |`);
  push(`| Provider requests carrying the sender's address, mail provider or phone | **${leaks.length ? `${leaks.length} cases` : "0"}** of ${m.privacy.providerRequests} requests | 0 |`, "");
  push(`Providers per live check: ${Object.entries(m.calls.providerTally).map(([k, v]) => `${k} ×${v}`).join(", ") || "none"}.`, "");

  push(`**Confusion matrix** (rows: expected, columns: engine verdict)`, "");
  push(`| expected \\ actual | verified | mismatch | unknown | crash |`, `|---|---|---|---|---|`);
  for (const exp of VERDICTS) {
    const row = m.confusion[exp];
    push(`| ${exp} | ${row.verified} | ${row.mismatch} | ${row.unknown} | ${row.crash} |`);
  }
  push("");

  push(`**Per case**`, "");
  push(`| # | Claimed organization | Sender | Expected | Engine | | Official domain found | Live | Cached | Live providers | Quotes valid |`, `|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const c of report.cases) {
    const sender = c.request.senderEmail ?? c.request.senderDomain;
    if (c.skipped) {
      push(`| ${c.id} | ${cell(c.request.claimedOrg)} | ${cell(sender || "-")} | ${c.expected} | skipped | | ${cell(c.skipped)} | | | | |`);
      continue;
    }
    const web = c.citations.filter((x) => x.status !== "not applicable");
    const ok = web.filter((x) => x.status === "valid").length;
    const out = web.filter((x) => x.status === "unreachable").length;
    const actual = c.actual ?? "-";
    const w = c.cached;
    const warmCell = !w ? "-" : w.skipped ? "skipped" : w.verdict ? `${w.ms} ms (${w.source})` : w.error ? "crash" : "-";
    push(
      `| ${c.id} | ${cell(c.request.claimedOrg)} | ${cell(sender)} | ${c.expected} | ${actual} | ${c.correct ? "✓" : "✗"} | ${c.live?.response?.officialDomain ?? "none"} | ${c.live ? `${c.live.ms} ms` : "-"} | ${warmCell} | ${(c.live?.response?.providers ?? []).join(", ") || "-"} | ${web.length ? `${ok}/${web.length - out}${out ? ` (+${out} unreachable)` : ""}` : "-"} |`,
    );
  }
  push("");

  const bad = [...new Map(all.filter((x) => x.status === "invalid" || x.status === "unreachable").map((x) => [`${x.url}\n${x.quote}`, x] as const)).values()];
  if (bad.length) {
    push(`**Citations that did not check out** (unique)`, "");
    for (const x of bad) {
      const ids = [...new Set(all.filter((y) => y.url === x.url && y.quote === x.quote).map((y) => y.caseId))].join(", ");
      push(`- ${x.status} · ${ids} · ${x.url} · "${cell(x.quote.slice(0, 120))}${x.quote.length > 120 ? "…" : ""}" · ${x.reason ?? ""}`);
    }
    push("");
  }

  push(`**Method**`, "");
  push(`- Inputs are claim/sender pairs only; nothing is sent to anyone. Free-email sender addresses are synthetic placeholders. Fictional organizations and the demo office are made up; no look-alike domains of real brands are used.`);
  push(`- Pass 1 deletes the case's \`check_cache\` row before every check, so each check is live. Pass 2 repeats the same cases with the cache warm. Organizations with no official site are never cached, so they run live again in pass 2 and are left out of cached latency${m.latency.notCacheable.length ? ` (${m.latency.notCacheable.join(", ")})` : ""}.`);
  push(`- Latency is wall-clock around \`runCheck\`. p95 uses the nearest-rank method (with n=${m.latency.liveN}: rank ${rank} of ${m.latency.liveN} sorted fastest to slowest${rank === m.latency.liveN ? ", i.e. the slowest check" : ""}). Live latency includes any caching Exa and Tavily do on their side, so repeating the same queries within minutes is faster than a first-ever check.`);
  push(`- API calls are counted by intercepting \`fetch\` during each check (Exa = api.exa.ai, Tavily = api.tavily.com). The same interceptor checks that no provider request body contains the sender's email, its local part, the sender's (non-official) domain or any phone number from the message.`);
  push(`- Citation validity: every web evidence item from the live pass is re-fetched with plain \`fetch\` (honest bot user-agent), tags/scripts/styles stripped, basic HTML entities decoded, whitespace collapsed, lowercased, and the markdown punctuation the engine itself strips (#, *, _, >, backtick, pipe) removed on both sides. ${u.validSpacingOnly ? `${u.validSpacingOnly} unique quote(s) matched only after ignoring spacing between adjacent tags. ` : ""}HTTP errors, timeouts, bot-challenge pages and JavaScript-only pages count as unreachable, not invalid. The engine's own \`verified\` flag was true for ${cs.engineFlaggedVerified}/${cs.total} items; it compares each quote with the same extracted text it was cut from, so only this independent re-fetch can catch a quote that is not on the page.`);
  for (const s of m.casesSkipped) push(`- ${s.id} skipped: ${s.reason}.`);
  if (m.verdictDriftBetweenPasses.length) push(`- Verdict changed between pass 1 and pass 2 for ${m.verdictDriftBetweenPasses.join(", ")}.`);
  push("");
  return lines.join("\n");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  if (process.argv.includes("--report")) {
    const report = JSON.parse(readFileSync(`${OUT_DIR}check.json`, "utf8")) as Report;
    report.metrics.citations = citationStats(report.cases.flatMap((c) => c.citations));
    writeFileSync(`${OUT_DIR}check.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(`${OUT_DIR}check.md`, render(report));
    console.log(`re-rendered ${OUT_DIR}check.md from check.json`);
    return;
  }
  const report = await evaluate();
  writeFileSync(`${OUT_DIR}check.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${OUT_DIR}check.md`, render(report));
  console.log(`wrote ${OUT_DIR}check.json and check.md`);
  if (report.metrics.falseVerified.length || report.metrics.crashes.length) process.exitCode = 1;
}

await main();
