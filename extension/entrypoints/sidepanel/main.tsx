import { StrictMode, useEffect, useMemo, useState } from "react";
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
import { apiFetch, clearLedger, onLedger, postJson, safeHttpUrl } from "@/lib/api";
import { PANEL_INTENT, type PanelIntent, type PanelTab } from "@/lib/messages";
import { loadSent, revokeSent, saveSent, sentStatus, type SentItem } from "@/lib/seal";
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

const TABS: { id: PanelTab; label: string }[] = [
  { id: "check", label: "Check" },
  { id: "seal", label: "Seal" },
  { id: "sheathe", label: "Sheathe" },
  { id: "guard", label: "Guard" },
  { id: "sent", label: "Sent" },
  { id: "ledger", label: "Ledger" },
];

const LONE_URL = /^\s*(https?:\/\/|www\.)\S+\s*$/i;

function LinkRow({ check }: { check: LinkCheck }) {
  return (
    <div className={cx("rounded-lg px-2.5 py-2 ring-1", check.level === "high" ? "bg-sith/10 ring-sith/30" : check.level === "medium" ? "bg-amber-400/5 ring-amber-300/20" : "bg-ink/[0.03] ring-ink/10")}>
      <div className="flex items-center gap-2 text-xs">
        <span className={check.level === "high" ? "text-sith" : check.level === "medium" ? "text-amber-300" : "text-slate-500"}>{check.level === "high" ? "!" : check.level === "medium" ? "△" : "·"}</span>
        <span className="truncate">{check.host ? <DomainParts host={check.host} domain={check.domain} /> : <span className="font-mono">{check.href.slice(0, 60)}</span>}</span>
      </div>
      {check.reasons.length > 0 && <p className="mt-1 text-[11px] text-slate-300">{check.reasons.join(" · ")}</p>}
    </div>
  );
}

function Verdict({ result }: { result: CheckResponse }) {
  const look = {
    verified: { title: "Verified", ring: "ring-saber/50", dot: "bg-saber text-slate-950", icon: "✓" },
    mismatch: { title: "Doesn't match", ring: "ring-sith/60", dot: "bg-sith text-ink", icon: "✕" },
    unknown: { title: "Unknown", ring: "ring-amber-300/50", dot: "bg-amber-300 text-slate-950", icon: "?" },
  }[result.verdict];
  const portal = safeHttpUrl(result.officialUploadUrl);
  return (
    <section className={cx("rounded-xl bg-slate-900/80 p-3 ring-2", look.ring)}>
      <div className="flex items-center gap-2">
        <span className={cx("flex h-8 w-8 items-center justify-center rounded-full font-bold", look.dot)}>{look.icon}</span>
        <div className="min-w-0">
          <p className="font-semibold">{look.title}</p>
          <p className="truncate text-xs text-slate-400">
            {result.claimedOrg}
            {result.officialDomain && <span className="font-mono text-jedi-400"> · {result.officialDomain}</span>}
          </p>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-200">{result.explanation}</p>
      {result.signals.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-amber-200">
          {result.signals.slice(0, 5).map((s) => (
            <li key={s}>⚑ {s}</li>
          ))}
        </ul>
      )}
      {(result.officialPhone || portal) && (
        <p className="mt-2 rounded-lg bg-ink/[0.04] px-2 py-1.5 text-xs ring-1 ring-ink/10">
          Official channel: {result.officialPhone && <span className="font-mono">Tel. {result.officialPhone}</span>}{" "}
          {portal && (
            <a href={portal} target="_blank" rel="noopener noreferrer" className="text-jedi-400 underline">
              portal ↗
            </a>
          )}
        </p>
      )}
      {result.evidence.length > 0 && (
        <div className="mt-2 space-y-1">
          {result.evidence.map((e, i) => (
            <a key={i} href={safeHttpUrl(e.url)} target="_blank" rel="noopener noreferrer" className="block rounded-lg bg-slate-950/70 p-2 text-xs ring-1 ring-ink/10 hover:ring-jedi-400/40">
              "{e.quote}"
              <span className="mt-1 block truncate font-mono text-[10px] text-jedi-400">{e.url.replace(/^https?:\/\//, "")}</span>
            </a>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-500">
        {(result.latencyMs / 1000).toFixed(1)}s · {result.source} · {result.providers.join(" → ")}
      </p>
    </section>
  );
}

function CheckTab({ seed }: { seed?: string }) {
  const [text, setText] = useState(seed ?? "");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (seed !== undefined) {
      setText(seed);
      setResult(null);
    }
  }, [seed]);

  const loneUrl = LONE_URL.test(text);
  const x = useMemo(() => extractRequest(text, from), [text, from]);
  const urls = useMemo(() => [...new Set(text.match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi) ?? [])], [text]);
  const ctx = result?.officialDomain && result.verdict !== "unknown" ? { officialDomain: result.officialDomain, officialName: result.officialName ?? result.claimedOrg } : {};
  const links = urls.map((u) => analyzeLink(u.startsWith("http") ? u : `https://${u}`, "", ctx));

  async function run() {
    setBusy(true);
    setError("");
    try {
      setResult(await postJson<CheckResponse>("/check", toCheckRequest(x)));
    } catch {
      setError("Check failed. Treat the sender as Unknown.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Section title="Paste a message or a link">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From (optional): Name <sender@example.com>"
          className="mb-2 w-full rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          rows={7}
          placeholder="Paste an email, a text message, a WhatsApp message, or a link you're unsure about…"
          className="w-full rounded-lg bg-slate-950/80 px-3 py-2 text-xs ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
        />
        <p className="mt-1 text-[10px] text-slate-500">Read on this device. Nothing above leaves unless you press Check.</p>
      </Section>

      {loneUrl && links[0] && (
        <Section title="Before you open it">
          <LinkRow check={links[0]} />
          {links[0].level === "low" && <p className="mt-2 text-xs text-slate-400">No warning signs found on this device. That doesn't make it safe: if it came with a request for documents or a login, check who's asking first.</p>}
        </Section>
      )}

      {!loneUrl && text.trim() && (
        <Section title="Read on this device">
          <div className="flex flex-wrap gap-1">
            {x.isDocumentRequest ? <Badge tone="amber">Asks for sensitive documents</Badge> : <Badge>No document request</Badge>}
            {x.requestedItems.map((i) => (
              <Badge key={i} tone="red">
                {i}
              </Badge>
            ))}
            {x.credentialAsks.map((i) => (
              <Badge key={i} tone="red">
                {i}
              </Badge>
            ))}
            {x.pressureSignals.map((p) => (
              <Badge key={p} tone="amber">
                {p}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Claims to be <b className="text-ink">{x.claimedOrg || "?"}</b>
            {x.senderEmail && <span className="font-mono"> · {x.senderEmail}</span>}
          </p>
          {links.length > 0 && (
            <div className="mt-2 space-y-1">
              {links.map((l) => (
                <LinkRow key={l.href} check={l} />
              ))}
            </div>
          )}
          <p className="mt-2 rounded-lg bg-jedi-500/10 px-2 py-1.5 text-[11px] text-jedi-400 ring-1 ring-jedi-400/20">
            Check sends only: "{x.claimedOrg || "…"}", the sender address, link domains and phone numbers. Never the message.
          </p>
          <Button variant="saber" className="mt-2" onClick={run} disabled={busy || x.claimedOrg.trim().length < 2}>
            {busy ? <Spinner /> : null} {busy ? "Checking the open web…" : "Check who's asking"}
          </Button>
          {error && <p className="mt-1 text-xs text-sith">{error}</p>}
        </Section>
      )}
      {result && <Verdict result={result} />}
    </div>
  );
}

function SealTab() {
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
        <Section title="Paste this link anywhere: WhatsApp, Slack, LinkedIn…">
          {links.map((l) => (
            <div key={l.id} className="mt-1 flex items-center gap-2">
              <input readOnly value={l.url} className="min-w-0 flex-1 rounded-md bg-slate-950/80 px-2 py-1 font-mono text-[10px] ring-1 ring-ink/10" />
              <Button
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(l.url);
                  setCopied(l.id);
                }}
              >
                {copied === l.id ? "Copied ✓" : "Copy"}
              </Button>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function SentTab() {
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
    const t = setInterval(() => {
      setNow(Date.now());
      poll();
    }, 4000);
    return () => {
      alive = false;
      clearInterval(t);
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

  if (!items.length) return <Section>Nothing sealed yet. Use Seal & Attach in Gmail, or the Seal tab.</Section>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">You stay in control. Revoke destroys the ciphertext, and it's gone for good if they haven't opened it yet.</p>
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
              {bytes(item.size)} → {item.officeName ?? item.recipient} {item.receiptOk && "· receipt ✓"}
              {live && <> · self-destructs in {countdown(item.expiresAt, now)}</>}
            </p>
            <div className="mt-1.5 flex gap-2">
              {live && (
                <Button variant="danger" onClick={() => revoke(item)} disabled={busy === item.id}>
                  {busy === item.id ? <Spinner /> : null} Revoke
                </Button>
              )}
              {!live && (
                <Button variant="ghost" onClick={() => saveSent(items.filter((i) => i.id !== item.id))}>
                  Clear
                </Button>
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

function LedgerTab() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => onLedger(setEntries), []);
  return (
    <Section
      title={`Privacy Ledger · ${entries.length} requests`}
      right={
        <button className="text-[11px] text-slate-500 hover:text-ink" onClick={() => clearLedger()}>
          Clear
        </button>
      }
    >
      <p className="mb-2 text-[11px] text-slate-400">Every request this extension made. Documents only ever leave as ciphertext.</p>
      <div className="space-y-1 font-mono text-[11px]">
        {entries.length === 0 && <p className="text-slate-500">Nothing has left this device yet.</p>}
        {entries.map((e, i) => (
          <button key={i} onClick={() => setOpen(open === i ? null : i)} className="block w-full rounded-md bg-ink/[0.03] px-2 py-1.5 text-left hover:bg-ink/[0.06]">
            <div className="flex items-center gap-2">
              <span className={e.method === "PUT" ? "text-saber" : e.method === "DELETE" ? "text-sith" : "text-jedi-400"}>{e.method}</span>
              <span className="truncate text-slate-300">{where(e.url)}</span>
              <span className="ml-auto shrink-0 text-slate-500">{bytes(e.bytes)}</span>
            </div>
            {open === i && (
              <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-500">
                {new Date(e.at).toLocaleTimeString()} {e.preview}
              </pre>
            )}
          </button>
        ))}
      </div>
    </Section>
  );
}

function SidePanel() {
  const [tab, setTab] = useState<PanelTab>("check");
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-card px-3.5 pt-3">
        <div className="flex items-center gap-2">
          <Mark className="h-6 w-6" />
          <h1 className="text-[19px] font-semibold leading-none text-ink">Avaran</h1>
          <span className="font-display text-[13px] leading-none text-ink-3" lang="sa">
            आवरण
          </span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-ink-3" title={`Service ${status}`}>
            <span className={cx("h-1.5 w-1.5 rounded-full", status === "online" ? "bg-neem-500" : status === "offline" ? "bg-geru-500" : "bg-haldi-500")} />
            {SUITE}
          </span>
        </div>
        <nav className="mt-2.5 flex gap-3.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "-mb-px border-b-2 pb-2 text-[13px] font-medium whitespace-nowrap transition-colors",
                tab === t.id ? "border-neel-600 text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-3.5">
        {tab === "check" && <CheckTab seed={seed} />}
        {tab === "seal" && <SealTab />}
        {tab === "sheathe" && <SheathePanel />}
        {tab === "guard" && <GuardPanel />}
        {tab === "sent" && <SentTab />}
        {tab === "ledger" && <LedgerTab />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
