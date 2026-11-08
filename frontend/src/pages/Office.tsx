import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyKit, Meta, OfficeKeys } from "@oj/core";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, Input, PqTag, SafetyWords, Spinner, StatusChip, VerifiedBadge } from "../components/ui";
import { Qr } from "../components/Qr";
import { Viewer } from "../components/Viewer";
import { LedgerPanel } from "../components/LedgerPanel";
import { APP_URL, ApiError } from "../lib/api";
import { ago, bytes, countdown } from "../lib/format";
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

const CHECKLIST = ["W-2", "1099-INT", "1099-NEC", "1098 Mortgage", "Photo ID", "Bank statement", "Pay stub", "Prior-year return"];
const EXPIRY = [
  { label: "1 hour", minutes: 60 },
  { label: "1 day", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
  { label: "30 days", minutes: 43200 },
];

function Setup({ onReady }: { onReady: (keys: OfficeKeys, kit: KeyKit, office: OfficeView) => void }) {
  const [name, setName] = useState("Maple Street Tax");
  const [domain, setDomain] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kitInput = useRef<HTMLInputElement>(null);

  async function submit() {
    setError("");
    if (pass.length < 8) return setError("Use a passphrase of at least 8 characters.");
    if (pass !== pass2) return setError("Passphrases don't match.");
    setBusy(true);
    try {
      const { keys, kit, office } = await createOffice(name, domain, pass);
      onReady(keys, kit, office);
    } catch (e) {
      setError(e instanceof ApiError ? `Could not register (${e.code}).` : "Key generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importKit(file: File) {
    try {
      saveKit(JSON.parse(await file.text()) as KeyKit);
      location.reload();
    } catch {
      setError("That file isn't a valid recovery kit.");
    }
  }

  return (
    <Card title="Set up your office" subtitle="Your keys are generated in this browser. We only ever receive the public half." right={<PqTag />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Office name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Official website domain" placeholder="maplestreettax.com" value={domain} onChange={(e) => setDomain(e.target.value)} hint="Clients will see this verified." />
        <Input label="Passphrase" type="password" value={pass} onChange={(e) => setPass(e.target.value)} hint="Encrypts your private keys on this device (Argon2id)." />
        <Input label="Repeat passphrase" type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
      </div>
      {error && <p className="mt-3 text-sm text-sith">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button variant="saber" onClick={submit} disabled={busy || !name || !domain}>
          {busy ? <Spinner /> : null}
          {busy ? "Generating post-quantum keys…" : "Generate keys & register"}
        </Button>
        <Button variant="ghost" onClick={() => kitInput.current?.click()}>
          Import recovery kit
        </Button>
        <input ref={kitInput} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importKit(e.target.files[0])} />
      </div>
    </Card>
  );
}

function Unlock({ kit, onReady }: { kit: KeyKit; onReady: (keys: OfficeKeys) => void }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      onReady(await unlock(kit, pass));
    } catch (e) {
      setError(e instanceof Error && e.message === "wrong_passphrase" ? "Wrong passphrase." : "Could not unlock.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={`Unlock ${kit.bundle.name}`} subtitle={`${kit.bundle.domain} · private keys stay encrypted until you unlock them here`} right={<PqTag />}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="min-w-64 flex-1">
          <Input label="Passphrase" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
        <Button variant="saber" type="submit" disabled={busy || !pass}>
          {busy ? <Spinner /> : null} Unlock
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            if (confirm("Remove this office's keys from this browser? Keep your recovery kit first.")) {
              clearKit();
              location.reload();
            }
          }}
        >
          Use a different office
        </Button>
      </form>
      {error && <p className="mt-3 text-sm text-sith">{error}</p>}
    </Card>
  );
}

function OfficeHeader({ office, kit, onOffice }: { office: OfficeView; kit: KeyKit; onOffice: (o: OfficeView) => void }) {
  const [checking, setChecking] = useState(false);
  const [dnsNote, setDnsNote] = useState("");
  async function verify() {
    setChecking(true);
    try {
      const r = await checkDns(office.domain);
      onOffice(r);
      setDnsNote(r.dnsMatch ? "Verified." : r.dnsFound ? "TXT record found but fingerprint doesn't match yet." : "No TXT record found yet. DNS can take a few minutes.");
    } finally {
      setChecking(false);
    }
  }
  return (
    <Card
      title={
        <span className="flex items-center gap-3">
          {office.name} <VerifiedBadge verified={office.verified} />
        </span>
      }
      subtitle={office.domain}
      right={
        <Button variant="ghost" onClick={() => downloadJson(`recovery-kit-${office.domain}.json`, kit)}>
          Download recovery kit
        </Button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Safety words · clients can confirm these by phone</p>
          <SafetyWords words={office.safetyWords} />
          <p className="mt-3 font-mono text-[11px] text-slate-500">fingerprint {office.fingerprint.slice(0, 32)}…</p>
        </div>
        {!office.verified && (
          <div className="rounded-xl bg-slate-950/60 p-3 ring-1 ring-white/10">
            <p className="text-xs uppercase tracking-wider text-slate-400">Verify your domain · add this DNS TXT record</p>
            <p className="mt-2 font-mono text-xs text-slate-300">
              <span className="text-slate-500">name </span>
              {office.dnsRecord.name}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-slate-300">
              <span className="text-slate-500">value </span>
              {office.dnsRecord.value}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="ghost" onClick={verify} disabled={checking}>
                {checking ? <Spinner /> : null} Check DNS
              </Button>
              {dnsNote && <span className="text-xs text-slate-400">{dnsNote}</span>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function NewRequest({ token, onCreated }: { token: string; onCreated: () => void }) {
  const [items, setItems] = useState<string[]>(["W-2", "Photo ID"]);
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState(43200);
  const [busy, setBusy] = useState(false);
  const toggle = (item: string) => setItems((list) => (list.includes(item) ? list.filter((i) => i !== item) : [...list, item]));
  async function create() {
    setBusy(true);
    try {
      await createRequest(token, items, note, expiry);
      setNote("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Request documents" subtitle="Clients get one link. Files arrive sealed to your key.">
      <div className="flex flex-wrap gap-2">
        {[...new Set([...CHECKLIST, ...items])].map((item) => (
          <button
            key={item}
            onClick={() => toggle(item)}
            className={`rounded-full px-3 py-1 text-sm ring-1 transition ${items.includes(item) ? "bg-jedi-500/20 text-jedi-400 ring-jedi-400/40" : "bg-white/5 text-slate-400 ring-white/10 hover:text-slate-200"}`}
          >
            {items.includes(item) ? "✓ " : "+ "}
            {item}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          placeholder="Add another item…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && custom.trim()) {
              setItems((l) => [...l, custom.trim()]);
              setCustom("");
            }
          }}
        />
        <Input placeholder="Note to client (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <select value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm ring-1 ring-white/10">
          {EXPIRY.map((x) => (
            <option key={x.minutes} value={x.minutes}>
              Link valid {x.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4">
        <Button variant="saber" onClick={create} disabled={busy || items.length === 0}>
          {busy ? <Spinner /> : null} Create request link
        </Button>
      </div>
    </Card>
  );
}

function RequestLinks({ requests }: { requests: OfficeRequest[] }) {
  const [copied, setCopied] = useState("");
  if (requests.length === 0) return null;
  const latest = requests[0];
  const link = `${APP_URL}/r/${latest.id}`;
  return (
    <Card title="Latest request link" subtitle={latest.checklist.join(" · ")}>
      <div className="flex flex-wrap items-center gap-5">
        <Qr value={link} />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="break-all rounded-lg bg-slate-950/70 px-3 py-2 font-mono text-xs text-slate-300 ring-1 ring-white/10">{link}</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopied(latest.id);
              }}
            >
              {copied === latest.id ? "Copied ✓" : "Copy link"}
            </Button>
            <a href={link} target="_blank" rel="noreferrer">
              <Button variant="ghost">Open as client</Button>
            </a>
          </div>
          <p className="text-xs text-slate-500">
            Expires {new Date(latest.expiresAt).toLocaleString()} · {requests.length} request link{requests.length > 1 ? "s" : ""} total
          </p>
        </div>
      </div>
    </Card>
  );
}

function Inbox({ handoffs, onOpen, opening }: { handoffs: HandoffSummary[]; onOpen: (h: HandoffSummary) => void; opening: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Sealed inbox <span className="h-2 w-2 animate-pulse rounded-full bg-saber" />
        </span>
      }
      subtitle="Live. Files are ciphertext on our server; they're decrypted only in this tab."
    >
      {handoffs.length === 0 && <p className="text-sm text-slate-500">Nothing yet. Send a request link to a client.</p>}
      <div className="space-y-2">
        {handoffs.map((h) => {
          const live = h.status === "stored" || h.status === "opened";
          return (
            <div key={h.id} className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ring-1 transition ${live ? "bg-white/[0.04] ring-white/10" : "bg-white/[0.01] opacity-60 ring-white/5"}`}>
              <span className="text-xl">{live ? "🔒" : h.status === "revoked" ? "⛔" : "⌛"}</span>
              <div className="min-w-0">
                <p className={`font-mono text-sm ${live ? "text-slate-200" : "text-slate-500 line-through"}`}>{h.id}</p>
                <p className="text-xs text-slate-500">
                  {bytes(h.paddedSize)} padded · arrived {ago(h.storedAt ?? h.createdAt, now)}
                  {h.openedAt && ` · opened ${ago(h.openedAt, now)}`}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {live && <span className="font-mono text-xs text-slate-400">self-destructs in {countdown(h.expiresAt, now)}</span>}
                <StatusChip status={h.status} />
                {live && (
                  <Button variant="primary" onClick={() => onOpen(h)} disabled={opening === h.id}>
                    {opening === h.id ? <Spinner /> : null} Decrypt
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Dashboard({ keys, kit }: { keys: OfficeKeys; kit: KeyKit }) {
  const [token, setToken] = useState("");
  const [office, setOffice] = useState<OfficeView | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffSummary[]>([]);
  const [requests, setRequests] = useState<OfficeRequest[]>([]);
  const [opening, setOpening] = useState("");
  const [viewing, setViewing] = useState<{ data: Uint8Array; meta: Meta } | null>(null);
  const [error, setError] = useState("");

  const ensureToken = useCallback(async () => {
    const session = await login(keys);
    setToken(session.token);
    setOffice(session.office);
    return session.token;
  }, [keys]);

  useEffect(() => {
    ensureToken().catch(() => setError("Could not sign in with your office key."));
  }, [ensureToken]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const [h, r] = await Promise.all([listHandoffs(token), listRequests(token)]);
      setHandoffs(h.handoffs);
      setRequests(r.requests);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) await ensureToken();
    }
  }, [token, ensureToken]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  async function open(h: HandoffSummary) {
    setOpening(h.id);
    setError("");
    try {
      setViewing(await openHandoff(h.id, token, keys));
      refresh();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 410 ? "The sender revoked this, or it expired. It's gone." : "Could not decrypt this handoff.");
      refresh();
    } finally {
      setOpening("");
    }
  }

  if (!office) return <Card>{error || "Signing in with your ML-DSA key…"}</Card>;

  return (
    <div className="space-y-5">
      <OfficeHeader office={office} kit={kit} onOffice={setOffice} />
      {error && <p className="rounded-lg bg-sith/10 px-4 py-2 text-sm text-sith ring-1 ring-sith/30">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <NewRequest token={token} onCreated={refresh} />
        <RequestLinks requests={requests} />
      </div>
      <Inbox handoffs={handoffs} onOpen={open} opening={opening} />
      <LedgerPanel title="Office Privacy Ledger" />
      {viewing && <Viewer data={viewing.data} meta={viewing.meta} onClose={() => setViewing(null)} />}
    </div>
  );
}

export default function OfficePage() {
  const [kit, setKit] = useState<KeyKit | null>(() => loadKit());
  const [keys, setKeys] = useState<OfficeKeys | null>(null);
  return (
    <Layout wide>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Office dashboard</h1>
        {keys && <Badge tone="green">Keys unlocked in memory only</Badge>}
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
