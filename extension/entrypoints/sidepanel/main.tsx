import { StrictMode, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  SUITE,
  analyzeLink,
  extractRequest,
  toCheckRequest,
  type CheckResponse,
  type HandoffStatus,
  type LedgerEntry,
  type LinkCheck,
} from "@oj/core";
import {
  FINDINGS,
  checkExplanation,
  checkSignals,
  credentialLabel,
  itemLabel,
  linkReasons,
  pressureLabel,
  verdictTip,
  verdictTitle,
} from "@oj/core/findings";
import { LOCALE_NAMES, languageName, type Locale } from "@oj/core/i18n";
import { LanguageSelect, Tip, TipIcon, useContentLocale, useFormat, useI18n, useLocale, useT } from "@oj/core/i18n/react";
import { apiFetch, clearLedger, onLedger, postJson, safeHttpUrl } from "@/lib/api";
import { PANEL_INTENT, type PanelIntent, type PanelTab } from "@/lib/messages";
import { loadSent, revokeSent, saveSent, sentStatus, type SentItem } from "@/lib/seal";
import { ExtI18n } from "@/lib/i18n";
import { PANEL } from "@/locales/panel";
import { SealFlow } from "@/components/SealFlow";
import { SheathePanel } from "@/components/SheathePanel";
import { GuardPanel } from "@/components/GuardPanel";
import { Badge, Button, DomainParts, Icon, Mark, Section, Spinner, StatusChip, bytes, countdown, cx } from "@/components/ui";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "@fontsource/eczar/500.css";
import "@fontsource/eczar/600.css";
import "@/assets/style.css";

const TABS: PanelTab[] = ["check", "seal", "sheathe", "guard", "sent", "ledger"];

const LONE_URL = /^\s*(https?:\/\/|www\.)\S+\s*$/i;

function LinkRow({ check, locale }: { check: LinkCheck; locale: Locale }) {
  const t = useT(PANEL, locale);
  const reasons = linkReasons(check, locale);
  return (
    <div className={cx("rounded-lg px-2.5 py-2 ring-1", check.level === "high" ? "bg-sith/10 ring-sith/30" : check.level === "medium" ? "bg-amber-400/5 ring-amber-300/20" : "bg-ink/[0.03] ring-ink/10")}>
      <div className="flex items-center gap-2 text-xs">
        <span role="img" aria-label={t(`risk.${check.level}`)} className={check.level === "high" ? "text-sith" : check.level === "medium" ? "text-amber-300" : "text-slate-500"}>
          {check.level === "high" ? "!" : check.level === "medium" ? "△" : "·"}
        </span>
        <span className="truncate">{check.host ? <DomainParts host={check.host} domain={check.domain} /> : <span className="font-mono">{check.href.slice(0, 60)}</span>}</span>
      </div>
      {reasons.length > 0 && <p className="mt-1 text-[11px] text-slate-300">{reasons.join(" · ")}</p>}
    </div>
  );
}

const LOOK = {
  verified: { ring: "ring-saber/50", dot: "bg-saber text-slate-950", icon: "✓" },
  mismatch: { ring: "ring-sith/60", dot: "bg-sith text-ink", icon: "✕" },
  unknown: { ring: "ring-amber-300/50", dot: "bg-amber-300 text-slate-950", icon: "?" },
} as const;

function Verdict({ result, locale }: { result: CheckResponse; locale: Locale }) {
  const tf = useT(FINDINGS, locale);
  const t = useT(PANEL, locale);
  const f = useFormat(locale);
  const look = LOOK[result.verdict];
  const portal = safeHttpUrl(result.officialUploadUrl);
  const signals = checkSignals(result, locale);
  return (
    <section lang={locale} className={cx("rounded-xl bg-slate-900/80 p-3 ring-2", look.ring)}>
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold", look.dot)}>
          {look.icon}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold">{verdictTitle(result.verdict, locale)}</p>
            <TipIcon text={verdictTip(result.verdict, locale)} label={t("verdict.tipLabel")} />
          </div>
          <p className="truncate text-xs text-slate-400">
            {result.claimedOrg}
            {result.officialDomain && <span className="font-mono text-jedi-400"> · {result.officialDomain}</span>}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-200">{checkExplanation(result, locale)}</p>
      {signals.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-200">
          {signals.slice(0, 5).map((s) => (
            <li key={s}>
              <span aria-hidden="true">⚑</span> {s}
            </li>
          ))}
        </ul>
      )}
      {(result.officialPhone || portal) && (
        <p className="mt-2 rounded-lg bg-ink/[0.04] px-2 py-1.5 text-xs ring-1 ring-ink/10">
          {tf("card.officialChannel")} {result.officialPhone && <span className="font-mono">{tf("card.tel", { phone: result.officialPhone })}</span>}{" "}
          {portal && (
            <a href={portal} target="_blank" rel="noopener noreferrer" className="text-jedi-400 underline">
              {t("check.portal")}
            </a>
          )}
        </p>
      )}
      {result.evidence.length > 0 && (
        <div className="mt-2 space-y-1">
          {result.evidence.map((e, i) => (
            <a key={i} href={safeHttpUrl(e.url)} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-slate-950/70 p-2 text-xs ring-1 ring-ink/10 hover:ring-jedi-400/40">
              {t("check.quote", { text: e.quote })}
              <span className="mt-1 block truncate font-mono text-[10px] text-jedi-400">{e.url.replace(/^https?:\/\//, "")}</span>
            </a>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-500">
        {tf("card.latency", { seconds: f.fixed(result.latencyMs / 1000, 1), source: tf(`source.${result.source}`) })} · {result.providers.join(" → ")}
      </p>
    </section>
  );
}

function CheckTab({ seed }: { seed?: string }) {
  const t = useT(PANEL);
  const tf = useT(FINDINGS);
  const { locale: uiLocale, findingsMode } = useI18n();
  const [text, setText] = useState(seed ?? "");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (seed !== undefined) {
      setText(seed);
      setResult(null);
    }
  }, [seed]);

  const loneUrl = LONE_URL.test(text);
  const x = useMemo(() => extractRequest(text, from), [text, from]);
  const content = useContentLocale(x.language);
  const tc = useT(PANEL, content.locale);
  const tfc = useT(FINDINGS, content.locale);
  const urls = useMemo(() => [...new Set(text.match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi) ?? [])], [text]);
  const ctx = result?.officialDomain && result.verdict !== "unknown" ? { officialDomain: result.officialDomain, officialName: result.officialName ?? result.claimedOrg } : {};
  const links = urls.map((u) => analyzeLink(u.startsWith("http") ? u : `https://${u}`, "", ctx));
  const detectedName = content.detected ? languageName(content.detected, content.locale) : "";
  const other = content.followingContent ? content.uiLocale : content.detected;

  async function run() {
    setBusy(true);
    setError(false);
    try {
      setResult(await postJson<CheckResponse>("/check", toCheckRequest(x)));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Section title={t("check.title")}>
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder={t("check.from")}
          aria-label={t("check.fromLabel")}
          className="mb-2 w-full rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          rows={7}
          placeholder={t("check.text")}
          aria-label={t("check.textLabel")}
          className="w-full rounded-lg bg-slate-950/80 px-3 py-2 text-xs ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
        />
        <p className="mt-1 text-[10px] text-slate-500">{t("check.local")}</p>
      </Section>

      {loneUrl && links[0] && (
        <Section title={t("check.before")}>
          <LinkRow check={links[0]} locale={content.locale} />
          {links[0].level === "low" && <p className="mt-2 text-xs text-slate-400">{t("check.noWarnings")}</p>}
        </Section>
      )}

      {!loneUrl && text.trim() && (
        <Section title={t("check.readHere")}>
          {content.detected && (
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <Tip text={tfc("lang.tip", { language: detectedName })}>
                <span lang={content.locale} tabIndex={0} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper-2 px-2 py-px text-ink-2">
                  <Icon name="globe" className="h-3 w-3" />
                  {tfc("lang.detected", { language: detectedName })}
                </span>
              </Tip>
              {content.canSwitch && other && (
                <button type="button" onClick={content.toggle} className="font-medium text-neel-700 underline-offset-2 hover:underline">
                  {tf("lang.showIn", { language: languageName(other, uiLocale) })}
                </button>
              )}
            </div>
          )}
          <div lang={content.locale}>
            <div className="flex flex-wrap gap-1">
              {x.isDocumentRequest ? (
                <Tip text={tfc("tip.asksFor")}>
                  <Badge tone="amber" tabIndex={0}>
                    {tc("check.asksDocs")}
                  </Badge>
                </Tip>
              ) : (
                <Badge>{tc("check.noDocs")}</Badge>
              )}
              {x.requestedItems.map((i) => (
                <Badge key={i} tone="red">
                  {itemLabel(i, content.locale)}
                </Badge>
              ))}
              {x.credentialAsks.map((i) => (
                <Badge key={i} tone="red">
                  {credentialLabel(i, content.locale)}
                </Badge>
              ))}
              {x.pressureSignals.map((p) => (
                <Badge key={p} tone="amber">
                  {pressureLabel(p, content.locale)}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {tfc("card.claimsToBe")} <b className="text-ink">{x.claimedOrg || "?"}</b>
              {x.senderEmail && <span className="font-mono"> · {x.senderEmail}</span>}
            </p>
            {links.length > 0 && (
              <div className="mt-2 space-y-1">
                {links.map((l) => (
                  <LinkRow key={l.href} check={l} locale={content.locale} />
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 rounded-lg bg-jedi-500/10 px-2 py-1.5 text-[11px] text-jedi-400 ring-1 ring-jedi-400/20">{t("check.sendsOnly", { org: x.claimedOrg || "…" })}</p>
          <Tip text={tf("tip.checkWho")}>
            <Button variant="saber" className="mt-2" onClick={run} disabled={busy || x.claimedOrg.trim().length < 2}>
              {busy ? <Spinner /> : null} {busy ? tf("card.checkingWeb") : tf("card.checkWho")}
            </Button>
          </Tip>
          {error && (
            <p role="alert" className="mt-1 text-xs text-sith">
              {t("check.failed")}
            </p>
          )}
        </Section>
      )}
      <div aria-live="polite">{result && <Verdict result={result} locale={content.locale} />}</div>
    </div>
  );
}

function SealTab() {
  const t = useT(PANEL);
  const [round, setRound] = useState(0);
  const [links, setLinks] = useState<SentItem[]>([]);
  const [copied, setCopied] = useState("");
  return (
    <div className="space-y-3">
      <SealFlow
        key={round}
        onSealed={(items) => setLinks(items)}
        onClose={() => {
          setRound((r) => r + 1);
          setLinks([]);
        }}
      />
      {links.length > 0 && (
        <Section title={t("seal.pasteLink")}>
          {links.map((l) => (
            <div key={l.id} className="mt-1 flex items-center gap-2">
              <input readOnly value={l.url} aria-label={t("seal.linkLabel", { name: l.name })} className="min-w-0 flex-1 rounded-md bg-slate-950/80 px-2 py-1 font-mono text-[10px] ring-1 ring-ink/10" />
              <Tip text={t("seal.copy.tip")}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(l.url);
                    setCopied(l.id);
                  }}
                >
                  {copied === l.id ? t("seal.copied") : t("seal.copy")}
                </Button>
              </Tip>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function SentTab() {
  const t = useT(PANEL);
  const locale = useLocale();
  const [items, setItems] = useState<SentItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, HandoffStatus>>({});
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    loadSent().then(setItems);
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && changes.sent) setItems((changes.sent.newValue as SentItem[]) ?? []);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    let alive = true;
    async function poll() {
      const live = items.filter((i) => !["revoked", "expired"].includes(statuses[i.id] ?? ""));
      const entries = await Promise.all(live.map(async (i) => [i.id, (await sentStatus(i).catch(() => null))?.status] as const));
      const found = Object.fromEntries(entries.filter((e): e is readonly [string, HandoffStatus] => Boolean(e[1])));
      if (alive) setStatuses((s) => ({ ...s, ...found }));
    }
    poll();
    const timer = setInterval(() => {
      setNow(Date.now());
      poll();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [items]);

  async function revoke(item: SentItem) {
    setBusy(item.id);
    try {
      const r = await revokeSent(item);
      setStatuses((s) => ({ ...s, [item.id]: r.status }));
    } finally {
      setBusy("");
    }
  }

  if (!items.length) return <Section>{t("sent.empty")}</Section>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">{t("sent.intro")}</p>
      {items.map((item) => {
        const status = statuses[item.id] ?? "stored";
        const live = status === "stored" || status === "opened";
        return (
          <div key={item.id} className="rounded-xl bg-slate-900/70 p-2.5 ring-1 ring-ink/10">
            <div className="flex items-center gap-2">
              <span><Icon name={live ? "lock" : status === "revoked" ? "x" : "alert"} className={cx("h-4 w-4", live ? "text-neel-600" : "text-ink-3")} /></span>
              <p className={cx("min-w-0 flex-1 truncate text-sm", !live && "text-slate-500 line-through")}>{item.name}</p>
              <StatusChip status={status} />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              {bytes(item.size, locale)} → {item.officeName ?? item.recipient} {item.receiptOk && t("sent.receipt")}
              {live && <> {t("sent.selfDestructs", { time: countdown(item.expiresAt, now, locale) })}</>}
            </p>
            <div className="mt-1.5 flex gap-2">
              {live && (
                <Tip text={t("sent.revoke.tip")}>
                  <Button variant="danger" onClick={() => revoke(item)} disabled={busy === item.id}>
                    {busy === item.id ? <Spinner /> : null} {t("sent.revoke")}
                  </Button>
                </Tip>
              )}
              {!live && (
                <Tip text={t("sent.clear.tip")}>
                  <Button variant="ghost" onClick={() => saveSent(items.filter((i) => i.id !== item.id))}>
                    {t("sent.clear")}
                  </Button>
                </Tip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function where(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/(ho|rq)_[A-Za-z0-9_-]+/g, "$1_…").replace(/\/object\/(upload\/)?sign\/.*/, "/object/$1sign/…")}`;
  } catch {
    return url;
  }
}

const CIPHERTEXT_PREVIEW = /^\[ciphertext · ([\d.,\s  ']+) bytes\]$/;

function LedgerTab() {
  const t = useT(PANEL);
  const f = useFormat();
  const locale = useLocale();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => onLedger(setEntries), []);
  const preview = (text: string) => {
    if (locale === "en") return text;
    if (text === "[body]") return t("ledger.body");
    const m = CIPHERTEXT_PREVIEW.exec(text);
    return m ? t("ledger.ciphertext", { size: f.number(Number(m[1]!.replace(/\D/g, ""))) }) : text;
  };
  return (
    <Section
      title={t("ledger.title", { count: entries.length })}
      right={
        <Tip text={t("ledger.clear.tip")}>
          <button className="text-[11px] text-slate-500 hover:text-ink" onClick={() => clearLedger()}>
            {t("ledger.clear")}
          </button>
        </Tip>
      }
    >
      <p className="mb-2 text-[11px] text-slate-400">
        {t("ledger.intro")} <TipIcon text={t("ledger.tip")} label={t("ledger.tipLabel")} />
      </p>
      <div className="space-y-1 font-mono text-[11px]">
        {entries.length === 0 && <p className="text-slate-500">{t("ledger.empty")}</p>}
        {entries.map((e, i) => (
          <button key={i} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)} className="block w-full rounded-md bg-ink/[0.03] px-2 py-1.5 text-left hover:bg-ink/[0.06]">
            <div className="flex items-center gap-2">
              <span className={e.method === "PUT" ? "text-saber" : e.method === "DELETE" ? "text-sith" : "text-jedi-400"}>{e.method}</span>
              <span className="truncate text-slate-300">{where(e.url)}</span>
              <span className="ml-auto shrink-0 text-slate-500">{bytes(e.bytes, locale)}</span>
            </div>
            {open === i && (
              <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-500">
                {f.time(e.at, { timeStyle: "medium" })} {preview(e.preview)}
              </pre>
            )}
          </button>
        ))}
      </div>
    </Section>
  );
}

function LanguageSettings({ id }: { id: string }) {
  const t = useT(PANEL);
  const tf = useT(FINDINGS);
  const { findingsMode, setFindingsMode } = useI18n();
  return (
    <div id={id} className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-paper px-2.5 py-2 text-[11.5px] text-ink-2">
      <LanguageSelect className="rounded-md border border-line-2 bg-card px-1.5 py-1 text-[12px] text-ink" />
      <div className="flex min-w-0 flex-1 basis-40 items-start gap-1.5">
        <input
          id={`${id}-findings`}
          type="checkbox"
          className="mt-0.5 shrink-0"
          checked={findingsMode === "content"}
          onChange={(e) => setFindingsMode(e.target.checked ? "content" : "ui")}
        />
        <label htmlFor={`${id}-findings`} className="min-w-0 leading-snug">
          {tf("lang.setting")}
        </label>
        <TipIcon text={tf("lang.setting.tip")} label={t("settings.more")} style={{ flexShrink: 0 }} />
      </div>
    </div>
  );
}

function SidePanel() {
  const t = useT(PANEL);
  const locale = useLocale();
  const [tab, setTab] = useState<PanelTab>("check");
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});

  useEffect(() => {
    apiFetch<{ ok: boolean }>("/health")
      .then((r) => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));
    const apply = (intent?: PanelIntent) => {
      if (!intent || Date.now() - intent.at > 60_000) return;
      setTab(intent.tab);
      if (intent.text !== undefined) setSeed(intent.text);
      browser.storage.session.remove(PANEL_INTENT);
    };
    browser.storage.session.get(PANEL_INTENT).then((r) => apply(r[PANEL_INTENT] as PanelIntent | undefined));
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "session" && changes[PANEL_INTENT]?.newValue) apply(changes[PANEL_INTENT].newValue as PanelIntent);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = TABS.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    const id = TABS[next]!;
    setTab(id);
    tabRefs.current[id]?.focus();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-card px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <Mark className="h-6 w-6" />
          <h1 className="text-[19px] font-semibold leading-none text-ink">Avaran</h1>
          <span className="font-display text-[13px] leading-none text-ink-3" lang="sa">
            आवरण
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-ink-3" title={t(`service.${status}`)}>
            <span aria-hidden="true" className={cx("h-1.5 w-1.5 rounded-full", status === "online" ? "bg-neem-500" : status === "offline" ? "bg-geru-500" : "bg-haldi-500")} />
            {SUITE}
          </span>
          <Tip text={t("settings.button")} side="bottom">
            <button
              type="button"
              aria-expanded={settingsOpen}
              aria-controls="oj-lang-settings"
              aria-label={`${t("settings.button")}: ${LOCALE_NAMES[locale]}`}
              onClick={() => setSettingsOpen((v) => !v)}
              className={cx("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none text-ink-2 hover:bg-paper-2", settingsOpen ? "border-neel-300 bg-paper-2" : "border-line-2")}
            >
              <Icon name="globe" className="h-3.5 w-3.5" />
              {locale.toUpperCase()}
            </button>
          </Tip>
        </div>
        {settingsOpen && <LanguageSettings id="oj-lang-settings" />}
        <div role="tablist" aria-label={t("tabs.label")} className="mt-2.5 flex flex-wrap gap-x-3.5">
          {TABS.map((id, i) => (
            <Tip key={id} text={t(`tab.${id}.tip`)} side="bottom">
              <button
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                id={`oj-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={tab === id}
                aria-controls="oj-tabpanel"
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cx(
                  "-mb-px border-b-2 pb-2 text-[13px] font-medium whitespace-nowrap transition-colors",
                  tab === id ? "border-neel-600 text-ink" : "border-transparent text-ink-3 hover:text-ink",
                )}
              >
                {t(`tab.${id}`)}
              </button>
            </Tip>
          ))}
        </div>
      </header>
      <main className="flex-1 p-3.5">
        <div id="oj-tabpanel" role="tabpanel" aria-labelledby={`oj-tab-${tab}`}>
          {tab === "check" && <CheckTab seed={seed} />}
          {tab === "seal" && <SealTab />}
          {tab === "sheathe" && <SheathePanel />}
          {tab === "guard" && <GuardPanel />}
          {tab === "sent" && <SentTab />}
          {tab === "ledger" && <LedgerTab />}
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExtI18n syncDocument>
      <SidePanel />
    </ExtI18n>
  </StrictMode>,
);
