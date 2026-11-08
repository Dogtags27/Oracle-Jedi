import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from "react";
import type { KeyKit, Meta, OfficeKeys } from "@oj/core";
import { LOCALES, LOCALE_NAMES, type Locale } from "@oj/core/i18n";
import { Tip, TipIcon, useFormat, useLocale, useT } from "@oj/core/i18n/react";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, Icon, Input, PqTag, SafetyWords, Spinner, StatusChip, VerifiedBadge } from "../components/ui";
import { Qr } from "../components/Qr";
import { Viewer } from "../components/Viewer";
import { LedgerPanel } from "../components/LedgerPanel";
import { APP_URL, ApiError } from "../lib/api";
import { usePolling } from "../lib/poll";
import {
  checkDns,
  clearKit,
  createOffice,
  createRequest,
  downloadJson,
  listHandoffs,
  listRequests,
  loadKit,
  login,
  openHandoff,
  saveKit,
  unlock,
} from "../lib/office";
import type { HandoffSummary, OfficeRequest, OfficeView } from "../lib/types";
import { OFFICE } from "../locales/office";
import { CHECKLIST, isChecklistItem } from "../locales/checklist";

const CHECKLIST_ITEMS = ["W-2", "1099-INT", "1099-NEC", "1098 Mortgage", "Photo ID", "Bank statement", "Pay stub", "Prior-year return"];
const EXPIRY = [60, 1440, 10080, 43200] as const;
const DATE_TIME: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" };

function Tipped({ when, text, children }: { when: boolean; text: string; children: ReactElement }) {
  return when ? <Tip text={text}>{children}</Tip> : children;
}

function useChecklistLabel() {
  const tc = useT(CHECKLIST);
  return (item: string) => (isChecklistItem(item) ? tc(item) : item);
}

function withLang(url: string, lang: Locale) {
  const hash = url.indexOf("#");
  const base = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? "" : url.slice(hash);
  return `${base}${base.includes("?") ? "&" : "?"}lang=${lang}${fragment}`;
}

type SetupError = "" | "setup.err.short" | "setup.err.match" | "setup.err.taken" | "setup.err.keygen" | "setup.err.kit" | { code: string };

function Setup({ onReady }: { onReady: (keys: OfficeKeys, kit: KeyKit, office: OfficeView) => void }) {
  const t = useT(OFFICE);
  const [name, setName] = useState("Maple Street Tax");
  const [domain, setDomain] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SetupError>("");
  const kitInput = useRef<HTMLInputElement>(null);

  async function submit() {
    setError("");
    if (pass.length < 8) return setError("setup.err.short");
    if (pass !== pass2) return setError("setup.err.match");
    setBusy(true);
    try {
      const { keys, kit, office } = await createOffice(name, domain, pass);
      onReady(keys, kit, office);
    } catch (e) {
      setError(
        e instanceof ApiError && (e.code === "office_exists" || e.code === "office_locked")
          ? "setup.err.taken"
          : e instanceof ApiError
            ? { code: e.code }
            : "setup.err.keygen",
      );
    } finally {
      setBusy(false);
    }
  }

  async function importKit(file: File) {
    try {
      saveKit(JSON.parse(await file.text()) as KeyKit);
      location.reload();
    } catch {
      setError("setup.err.kit");
    }
  }

  return (
    <Card title={t("setup.title")} subtitle={t("setup.subtitle")} right={<PqTag />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t("setup.name")} value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={t("setup.domain")} placeholder="maplestreettax.com" value={domain} onChange={(e) => setDomain(e.target.value)} hint={t("setup.domain.hint")} />
        <Input label={t("setup.pass")} type="password" value={pass} onChange={(e) => setPass(e.target.value)} hint={t("setup.pass.hint")} />
        <Input label={t("setup.pass2")} type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-sith">
          {typeof error === "string" ? t(error) : t("setup.err.register", { code: error.code })}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Tipped when={!busy} text={t("setup.generate.tip")}>
          <Button variant="saber" onClick={submit} disabled={busy || !name || !domain}>
            {busy ? <Spinner /> : null}
            {busy ? t("setup.generating") : t("setup.generate")}
          </Button>
        </Tipped>
        <Tip text={t("setup.import.tip")}>
          <Button variant="ghost" onClick={() => kitInput.current?.click()}>
            {t("setup.import")}
          </Button>
        </Tip>
        <input
          ref={kitInput}
          type="file"
          accept="application/json"
          hidden
          aria-label={t("setup.kitFile")}
          onChange={(e) => e.target.files?.[0] && importKit(e.target.files[0])}
        />
      </div>
    </Card>
  );
}

function Unlock({ kit, onReady }: { kit: KeyKit; onReady: (keys: OfficeKeys) => void }) {
  const t = useT(OFFICE);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"" | "unlock.err.wrong" | "unlock.err.failed">("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      onReady(await unlock(kit, pass));
    } catch (e) {
      setError(e instanceof Error && e.message === "wrong_passphrase" ? "unlock.err.wrong" : "unlock.err.failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t("unlock.title", { name: kit.bundle.name })} subtitle={t("unlock.subtitle", { domain: kit.bundle.domain })} right={<PqTag />}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="min-w-64 flex-1">
          <Input label={t("setup.pass")} type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} aria-invalid={error ? true : undefined} />
        </div>
        <Button variant="saber" type="submit" disabled={busy || !pass}>
          {busy ? <Spinner /> : null} {t("unlock.button")}
        </Button>
        <Tip text={t("unlock.other.tip")}>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              if (confirm(t("unlock.confirm"))) {
                clearKit();
                location.reload();
              }
            }}
          >
            {t("unlock.other")}
          </Button>
        </Tip>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-sith">
          {t(error)}
        </p>
      )}
    </Card>
  );
}

type DnsNote = "" | "header.dns.verified" | "header.dns.mismatch" | "header.dns.missing" | "header.dns.error";

function OfficeHeader({ office, kit, onOffice }: { office: OfficeView; kit: KeyKit; onOffice: (o: OfficeView) => void }) {
  const t = useT(OFFICE);
  const [checking, setChecking] = useState(false);
  const [dnsNote, setDnsNote] = useState<DnsNote>("");
  async function verify() {
    setChecking(true);
    try {
      const r = await checkDns(office.domain);
      onOffice(r);
      setDnsNote(r.dnsMatch ? "header.dns.verified" : r.dnsFound ? "header.dns.mismatch" : "header.dns.missing");
    } catch {
      setDnsNote("header.dns.error");
    } finally {
      setChecking(false);
    }
  }
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-3">
          {office.name} <VerifiedBadge verified={office.verified} />
        </span>
      }
      subtitle={office.domain}
      right={
        <div className="flex flex-wrap justify-end gap-2">
          <Tip text={t("header.bundle.tip")}>
            <Button variant="ghost" onClick={() => downloadJson("handoff.json", kit.bundle)}>
              {t("header.bundle")}
            </Button>
          </Tip>
          <Tip text={t("header.kit.tip")}>
            <Button variant="ghost" onClick={() => downloadJson(`recovery-kit-${office.domain}.json`, kit)}>
              {t("header.kit")}
            </Button>
          </Tip>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
            <span>{t("header.words")}</span>
            <TipIcon text={t("header.words.tip")} label={t("header.words.label")} />
          </p>
          <SafetyWords words={office.safetyWords} />
          <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-slate-500">
            <span className="min-w-0 break-all">{t("header.fingerprint", { fp: office.fingerprint.slice(0, 32) })}</span>
            <TipIcon text={t("header.fingerprint.tip")} label={t("header.fingerprint.label")} />
          </p>
        </div>
        {!office.verified && (
          <div className="rounded-xl bg-slate-950/60 p-3 ring-1 ring-ink/10">
            <p className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
              <span>{t("header.dns.title")}</span>
              <TipIcon text={t("header.dns.tip")} label={t("header.dns.label")} />
            </p>
            <p className="mt-2 font-mono text-xs text-slate-300">
              <span className="text-slate-500">{t("header.dns.name")} </span>
              {office.dnsRecord.name}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-300">
              <span className="text-slate-500">{t("header.dns.value")} </span>
              {office.dnsRecord.value}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Tipped when={!checking} text={t("header.dns.check.tip")}>
                <Button variant="ghost" onClick={verify} disabled={checking}>
                  {checking ? <Spinner /> : null} {t("header.dns.check")}
                </Button>
              </Tipped>
              <span role="status" className="text-xs text-slate-400">
                {dnsNote && t(dnsNote)}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function NewRequest({ token, onCreated }: { token: string; onCreated: () => void }) {
  const t = useT(OFFICE);
  const label = useChecklistLabel();
  const [items, setItems] = useState<string[]>(["W-2", "Photo ID"]);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState(43200);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const toggle = (item: string) => setItems((list) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]));
  async function create() {
    setBusy(true);
    setFailed(false);
    try {
      await createRequest(token, items, note, expiry);
      setNote("");
      onCreated();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t("new.title")} subtitle={t("new.subtitle")}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("new.items")}>
        {[...new Set([...CHECKLIST_ITEMS, ...items])].map((item) => {
          const on = items.includes(item);
          return (
            <button
              key={item}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(item)}
              className={`rounded-full px-3 py-1 text-sm ring-1 transition ${on ? "bg-jedi-500/20 text-jedi-400 ring-jedi-400/40" : "bg-ink/5 text-slate-400 ring-ink/10 hover:text-slate-200"}`}
            >
              <span aria-hidden="true">{on ? "✓ " : "+ "}</span>
              {label(item)}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          placeholder={t("new.add")}
          aria-label={t("new.add")}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              setItems((l) => [...l, custom.trim()]);
              setCustom("");
            }
          }}
        />
        <Input placeholder={t("new.note")} aria-label={t("new.note")} value={note} onChange={(e) => setNote(e.target.value)} />
        <Tip text={t("new.expiry.tip")}>
          <select
            aria-label={t("new.expiry")}
            value={expiry}
            onChange={(e) => setExpiry(Number(e.target.value))}
            className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm ring-1 ring-ink/10"
          >
            {EXPIRY.map((m) => (
              <option key={m} value={m}>
                {t(`new.expiry.${m}`)}
              </option>
            ))}
          </select>
        </Tip>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Tipped when={!busy} text={t("new.create.tip")}>
          <Button variant="saber" onClick={create} disabled={busy || items.length === 0}>
            {busy ? <Spinner /> : null} {t("new.create")}
          </Button>
        </Tipped>
        {failed && (
          <span role="alert" className="text-sm text-sith">
            {t("new.err")}
          </span>
        )}
      </div>
    </Card>
  );
}

function RequestLinks({ requests }: { requests: OfficeRequest[] }) {
  const t = useT(OFFICE);
  const fmt = useFormat();
  const uiLocale = useLocale();
  const label = useChecklistLabel();
  const langId = useId();
  const [copied, setCopied] = useState("");
  const [lang, setLang] = useState<Locale | null>(null);
  if (requests.length === 0) return null;
  const latest = requests[0];
  const clientLang = lang ?? uiLocale;
  const link = withLang(`${APP_URL}/r/${latest.id}`, clientLang);
  return (
    <Card title={t("links.title")} subtitle={latest.checklist.map(label).join(" · ")}>
      <div className="flex flex-wrap items-center gap-5">
        <Qr value={link} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <label htmlFor={langId}>{t("links.lang")}</label>
            <Tip text={t("links.lang.tip")}>
              <select
                id={langId}
                value={clientLang}
                onChange={(e) => {
                  setLang(e.target.value as Locale);
                  setCopied("");
                }}
                className="rounded-lg bg-slate-950/80 px-2 py-1 text-xs text-slate-300 ring-1 ring-ink/10"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </select>
            </Tip>
          </div>
          <p className="break-all rounded-lg bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-300 ring-1 ring-ink/10">{link}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(latest.id);
              }}
            >
              {copied === latest.id ? t("links.copied") : t("links.copy")}
            </Button>
            <Tip text={t("links.open.tip")}>
              <a href={link} target="_blank" rel="noreferrer">
                <Button variant="ghost" tabIndex={-1}>
                  {t("links.open")}
                </Button>
              </a>
            </Tip>
            <span role="status" className="sr-only">
              {copied === latest.id ? t("links.copied") : ""}
            </span>
          </div>
          <p className="text-xs text-slate-500">{t("links.expires", { date: fmt.date(latest.expiresAt, DATE_TIME), count: requests.length })}</p>
        </div>
      </div>
    </Card>
  );
}

function Inbox({ handoffs, onOpen, opening }: { handoffs: HandoffSummary[]; onOpen: (h: HandoffSummary) => void; opening: string }) {
  const t = useT(OFFICE);
  const fmt = useFormat();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t("inbox.title")} <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-saber" />
          <TipIcon text={t("inbox.title.tip")} label={t("inbox.title.label")} />
        </span>
      }
      subtitle={t("inbox.subtitle")}
    >
      {handoffs.length === 0 && <p className="text-sm text-slate-500">{t("inbox.empty")}</p>}
      <div className="space-y-2">
        {handoffs.map((h) => {
          const live = h.status === "stored" || h.status === "opened";
          return (
            <div key={h.id} className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ring-1 transition ${live ? "bg-ink/[0.04] ring-ink/10" : "bg-ink/[0.01] opacity-60 ring-ink/5"}`}>
              <span className="text-xl" aria-hidden="true">
                <Icon name={live ? "lock" : h.status === "revoked" ? "x" : "alert"} className={`h-5 w-5 ${live ? "text-neel-600" : "text-ink-3"}`} />
              </span>
              <div className="min-w-0">
                <p className={`font-mono text-sm ${live ? "text-slate-200" : "text-slate-500 line-through"}`}>{h.id}</p>
                <p className="text-xs text-slate-500">
                  <Tip text={t("inbox.padded.tip")}>
                    <span tabIndex={0} className="cursor-help">
                      {t("inbox.padded", { size: fmt.bytes(h.paddedSize) })}
                    </span>
                  </Tip>
                  {t("inbox.arrived", { ago: fmt.ago(h.storedAt ?? h.createdAt, now) })}
                  {h.openedAt && t("inbox.opened", { ago: fmt.ago(h.openedAt, now) })}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                {live && (
                  <Tip text={t("inbox.expires.tip")}>
                    <span tabIndex={0} className="cursor-help font-mono text-xs text-slate-400">
                      {t("inbox.expires", { time: fmt.countdown(h.expiresAt, now) })}
                    </span>
                  </Tip>
                )}
                <StatusChip status={h.status} />
                {live && (
                  <Tipped when={!opening} text={t("inbox.decrypt.tip")}>
                    <Button variant="primary" onClick={() => onOpen(h)} disabled={opening === h.id}>
                      {opening === h.id ? <Spinner /> : null} {t("inbox.decrypt")}
                    </Button>
                  </Tipped>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

type DashError = "" | "dash.err.signIn" | "dash.err.gone" | "dash.err.decrypt";

function Dashboard({ keys, kit }: { keys: OfficeKeys; kit: KeyKit }) {
  const t = useT(OFFICE);
  const [token, setToken] = useState("");
  const [office, setOffice] = useState<OfficeView | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffSummary[]>([]);
  const [requests, setRequests] = useState<OfficeRequest[]>([]);
  const [opening, setOpening] = useState("");
  const [viewing, setViewing] = useState<{ data: Uint8Array; meta: Meta } | null>(null);
  const [error, setError] = useState<DashError>("");

  const ensureToken = useCallback(async () => {
    const session = await login(keys);
    setToken(session.token);
    setOffice(session.office);
    return session.token;
  }, [keys]);

  useEffect(() => {
    ensureToken().catch(() => setError("dash.err.signIn"));
  }, [ensureToken]);

  const refresh = useCallback(async () => {
    if (!token) return true;
    try {
      const [h, r] = await Promise.all([listHandoffs(token), listRequests(token)]);
      setHandoffs(h.handoffs);
      setRequests(r.requests);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        await ensureToken().catch(() => {});
        return true;
      }
      return false;
    }
  }, [token, ensureToken]);

  usePolling(refresh, 4000, Boolean(token));

  async function open(h: HandoffSummary) {
    setOpening(h.id);
    setError("");
    try {
      setViewing(await openHandoff(h.id, token, keys));
      refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 410 ? "dash.err.gone" : "dash.err.decrypt");
      refresh();
    } finally {
      setOpening("");
    }
  }

  if (!office)
    return (
      <Card>
        {error ? (
          <span role="alert">{t(error)}</span>
        ) : (
          <span role="status" className="inline-flex flex-wrap items-center gap-2">
            {t("dash.signingIn")}
            <TipIcon text={t("dash.signingIn.tip")} label={t("dash.signingIn.label")} />
          </span>
        )}
      </Card>
    );

  return (
    <div className="space-y-5">
      <OfficeHeader office={office} kit={kit} onOffice={setOffice} />
      {error && (
        <p role="alert" className="rounded-lg bg-sith/10 px-4 py-2 text-sm text-sith ring-1 ring-sith/30">
          {t(error)}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <NewRequest token={token} onCreated={refresh} />
        <RequestLinks requests={requests} />
      </div>
      <Inbox handoffs={handoffs} onOpen={open} opening={opening} />
      <LedgerPanel title={t("dash.ledger")} />
      {viewing && <Viewer data={viewing.data} meta={viewing.meta} onClose={() => setViewing(null)} />}
    </div>
  );
}

export default function OfficePage() {
  const t = useT(OFFICE);
  const [kit, setKit] = useState<KeyKit | null>(() => loadKit());
  const [keys, setKeys] = useState<OfficeKeys | null>(null);
  return (
    <Layout wide>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t("page.title")}</h1>
        {keys && (
          <Tip text={t("page.unlocked.tip")}>
            <span tabIndex={0} className="inline-flex rounded-full">
              <Badge tone="green">{t("page.unlocked")}</Badge>
            </span>
          </Tip>
        )}
      </div>
      {!kit && (
        <Setup
          onReady={(k, newKit) => {
            setKit(newKit);
            setKeys(k);
          }}
        />
      )}
      {kit && !keys && <Unlock kit={kit} onReady={setKeys} />}
      {kit && keys && <Dashboard keys={keys} kit={kit} />}
    </Layout>
  );
}
