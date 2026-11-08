import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, PqTag, SafetyWords, Spinner, StatusChip, VerifiedBadge } from "../components/ui";
import { LedgerPanel } from "../components/LedgerPanel";
import { ApiError, api } from "../lib/api";
import { bytes, countdown } from "../lib/format";
import { checkOfficeBundle, loadSent, revokeSent, saveSent, sendToOffice, sentStatus, type SentItem, type Stage } from "../lib/sender";
import type { PublicRequest } from "../lib/types";
import type { HandoffStatus } from "@oj/core";
import { TrimView, canTrim, findingsLine, releaseDoc, resultLine, scanFile, sensitiveMarks, warmUp, type TrimDoc, type TrimResult } from "@oj/core/trim-ui";

const STAGE_LABEL: Record<Stage, string> = {
  reserving: "Reserving a sealed slot…",
  encrypting: "Encrypting on this device · ML-KEM-768 + X25519 → AES-256-GCM",
  uploading: "Uploading ciphertext only…",
  finalizing: "Verifying the server's ML-DSA storage receipt…",
  done: "Sealed ✓",
};

const TTL = [
  { label: "2 minutes (demo)", minutes: 2 },
  { label: "1 day", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
  { label: "30 days", minutes: 43200 },
];

interface Pending {
  file: File;
  stage?: Stage;
  error?: string;
  scanning?: boolean;
  doc?: TrimDoc;
  trimmed?: TrimResult;
}

export function SentList({ items, onChange }: { items: SentItem[]; onChange: (items: SentItem[]) => void }) {
  const [statuses, setStatuses] = useState<Record<string, HandoffStatus>>({});
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    async function poll() {
      const entries = await Promise.all(items.map(async (i) => [i.id, (await sentStatus(i).catch(() => null))?.status] as const));
      if (alive) setStatuses(Object.fromEntries(entries.filter(([, s]) => s)) as Record<string, HandoffStatus>);
    }
    poll();
    const t = setInterval(() => {
      setNow(Date.now());
      poll();
    }, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [items]);
  if (items.length === 0) return null;
  async function revoke(item: SentItem) {
    setBusy(item.id);
    try {
      await revokeSent(item);
      setStatuses((s) => ({ ...s, [item.id]: "revoked" }));
    } finally {
      setBusy("");
    }
  }
  return (
    <Card title="You're still in control" subtitle="Revoke any document at any time. Before it's opened, it's destroyed for good.">
      <div className="space-y-2">
        {items.map((item) => {
          const status = statuses[item.id] ?? "stored";
          const live = status === "stored" || status === "opened";
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.04] px-4 py-3 ring-1 ring-ink/10">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {bytes(item.size)} → {item.officeName} {item.receiptOk && "· receipt verified ✓"}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                {live && <span className="font-mono text-xs text-slate-400">self-destructs in {countdown(item.expiresAt, now)}</span>}
                <StatusChip status={status} />
                {live && (
                  <Button variant="danger" onClick={() => revoke(item)} disabled={busy === item.id}>
                    {busy === item.id ? <Spinner /> : null} Revoke
                  </Button>
                )}
                {!live && (
                  <button className="text-xs text-slate-500 hover:text-slate-300" onClick={() => onChange(items.filter((i) => i.id !== item.id))}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function RequestPage() {
  const { id = "" } = useParams();
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [bundleOk, setBundleOk] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [ttl, setTtl] = useState(10080);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<SentItem[]>(() => loadSent());
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [trimming, setTrimming] = useState<File | null>(null);
  const docs = useRef<TrimDoc[]>([]);

  useEffect(() => {
    warmUp();
    return () => docs.current.forEach(releaseDoc);
  }, []);

  const patch = (file: File, change: Partial<Pending>) => setPending((p) => p.map((x) => (x.file === file ? { ...x, ...change } : x)));

  useEffect(() => {
    api<PublicRequest>(`/requests/${id}`)
      .then(async (r) => {
        setRequest(r);
        setBundleOk(await checkOfficeBundle(r));
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 410 ? "This request link has expired." : "This request link isn't valid."));
  }, [id]);

  const updateSent = (items: SentItem[]) => {
    setSent(items);
    saveSent(items);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files);
    setPending((p) => [...p, ...list.map((file) => ({ file, scanning: true }))]);
    for (const file of list) {
      scanFile(file)
        .then((doc) => {
          docs.current.push(doc);
          patch(file, { doc, scanning: false });
        })
        .catch(() => patch(file, { scanning: false }));
    }
  };

  const trimDoc = trimming ? pending.find((p) => p.file === trimming)?.doc : undefined;
  const untrimmed = pending.filter((p) => !p.trimmed && p.doc && sensitiveMarks(p.doc).length > 0).length;

  async function sendAll() {
    if (!request) return;
    setSending(true);
    const results: SentItem[] = [];
    for (let i = 0; i < pending.length; i++) {
      const setStage = (stage: Stage) => setPending((p) => p.map((x, j) => (j === i ? { ...x, stage } : x)));
      try {
        const file = pending[i].trimmed?.file ?? pending[i].file;
        const item = await sendToOffice(
          { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()), redactions: pending[i].trimmed?.summary },
          request,
          ttl,
          setStage,
        );
        results.push(item);
      } catch {
        setPending((p) => p.map((x, j) => (j === i ? { ...x, error: "Failed to send" } : x)));
      }
    }
    updateSent([...results, ...sent]);
    setPending((p) => p.filter((x) => x.error));
    setSending(false);
  }

  return (
    <Layout>
      {error && <Card title="Link unavailable">{error}</Card>}
      {!request && !error && <Card>Loading request…</Card>}
      {request && (
        <div className="space-y-5">
          <Card
            title={
              <span className="flex flex-wrap items-center gap-3">
                {request.office.name} is asking for documents <VerifiedBadge verified={request.office.verified} />
              </span>
            }
            subtitle={request.office.domain}
            right={bundleOk ? <Badge tone="green">Office key signature valid</Badge> : bundleOk === false ? <Badge tone="red">Key check failed</Badge> : <Spinner />}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">They need</p>
                <ul className="space-y-1">
                  {request.checklist.map((item) => (
                    <li key={item} className="text-sm text-slate-200">
                      ▸ {item}
                    </li>
                  ))}
                </ul>
                {request.note && <p className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-sm text-slate-300">"{request.note}"</p>}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Safety words · ask the office to read these back</p>
                <SafetyWords words={request.office.safetyWords} />
                <p className="mt-3 text-xs text-slate-500">Only {request.office.name}'s private key can open what you send. Not us, not our cloud.</p>
              </div>
            </div>
          </Card>

          <Card title="Add your documents" subtitle="Encrypted in this browser before anything is uploaded." right={<PqTag />}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
              onClick={() => input.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-saber bg-saber/5" : "border-ink/15 hover:border-ink/30"}`}
            >
              <p className="text-slate-300">Drop files here or tap to choose</p>
              <p className="mt-1 text-xs text-slate-500">PDF, images, anything. Nothing leaves this device unencrypted.</p>
              <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
            {pending.length > 0 && (
              <div className="mt-4 space-y-2">
                {pending.map((p, i) => {
                  const shown = p.trimmed?.file ?? p.file;
                  const found = p.doc ? findingsLine(p.doc) : "";
                  return (
                    <div key={i} className="rounded-lg bg-ink/[0.04] px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="truncate">{shown.name}</span>
                        <span className="text-xs text-slate-500">{bytes(shown.size)}</span>
                        <span className={`ml-auto text-xs ${p.error ? "text-sith" : "text-jedi-400"}`}>{p.error ?? (p.stage ? STAGE_LABEL[p.stage] : "Ready")}</span>
                        {!sending && !p.stage && (
                          <button className="text-xs text-slate-500 hover:text-ink" onClick={() => setPending((x) => x.filter((_, j) => j !== i))}>
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {p.scanning && <span className="text-slate-500">Scanning on this device…</span>}
                        {p.trimmed && (
                          <>
                            <span className="text-saber">✓ Trimmed and verified · {resultLine(p.trimmed)}</span>
                            {!p.stage && (
                              <button className="text-slate-500 underline hover:text-ink" onClick={() => patch(p.file, { trimmed: undefined })}>
                                undo
                              </button>
                            )}
                          </>
                        )}
                        {!p.trimmed && p.doc && !canTrim(p.doc) && <span className="text-slate-500">{p.doc.notes[0]}</span>}
                        {!p.trimmed && p.doc && canTrim(p.doc) && (
                          <>
                            {found ? <span className="text-sith">Contains {found}</span> : <span className="text-slate-500">No ID or account numbers found</span>}
                            {!p.stage && (
                              <Button variant={found ? "danger" : "ghost"} className="px-2 py-0.5 text-xs" onClick={() => setTrimming(p.file)} data-action="trim">
                                Trim
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {untrimmed > 0 && !sending && (
                  <p className="text-xs text-amber-200">
                    {untrimmed === 1 ? "1 file still has" : `${untrimmed} files still have`} sensitive numbers. Trim sends only what {request.office.name} needs.
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="saber" onClick={sendAll} disabled={sending || pending.length === 0 || !bundleOk}>
                {sending ? <Spinner /> : null} Seal & send {pending.length > 0 ? `(${pending.length})` : ""}
              </Button>
              <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))} className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm ring-1 ring-ink/10">
                {TTL.map((t) => (
                  <option key={t.minutes} value={t.minutes}>
                    Self-destruct after {t.label}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <SentList items={sent} onChange={updateSent} />
          {trimming && trimDoc && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/80 p-4">
              <div className="w-full max-w-3xl rounded-2xl bg-slate-900 p-5 ring-1 ring-ink/10">
                <TrimView
                  doc={trimDoc}
                  need={request.checklist}
                  onCancel={() => setTrimming(null)}
                  onDone={(result) => {
                    patch(trimming, { trimmed: result });
                    setTrimming(null);
                  }}
                />
              </div>
            </div>
          )}
          <LedgerPanel />
        </div>
      )}
    </Layout>
  );
}
