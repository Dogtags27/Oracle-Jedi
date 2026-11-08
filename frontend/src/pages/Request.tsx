import { useEffect, useRef, useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { Tip, TipIcon, useFormat, useLocale, useT } from "@oj/core/i18n/react";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, PqTag, SafetyWords, Spinner, StatusChip, VerifiedBadge } from "../components/ui";
import { LedgerPanel } from "../components/LedgerPanel";
import { ApiError, api } from "../lib/api";
import { usePolling } from "../lib/poll";
import { checkOfficeBundle, loadSent, revokeSent, saveSent, sendToOffice, sentStatus, type SentItem, type Stage } from "../lib/sender";
import type { PublicRequest } from "../lib/types";
import type { HandoffStatus } from "@oj/core";
import { TrimView, canTrim, findingsLine, releaseDoc, resultLine, scanFile, sensitiveMarks, trimNotes, warmUp, type TrimDoc, type TrimResult } from "@oj/core/trim-ui";
import { REQUEST } from "../locales/request";
import { CHECKLIST, isChecklistItem } from "../locales/checklist";

const STAGE_KEY = {
  reserving: "stage.reserving",
  encrypting: "stage.encrypting",
  uploading: "stage.uploading",
  finalizing: "stage.finalizing",
  done: "stage.done",
} as const satisfies Record<Stage, string>;

const TTL = [2, 1440, 10080, 43200] as const;

interface Pending {
  file: File;
  stage?: Stage;
  failed?: boolean;
  scanning?: boolean;
  doc?: TrimDoc;
  trimmed?: TrimResult;
}

function Tipped({ when, text, children }: { when: boolean; text: string; children: ReactElement }) {
  return when ? <Tip text={text}>{children}</Tip> : children;
}

function useChecklistLabel() {
  const tc = useT(CHECKLIST);
  return (item: string) => (isChecklistItem(item) ? tc(item) : item);
}

export function SentList({ items, onChange }: { items: SentItem[]; onChange: (items: SentItem[]) => void }) {
  const t = useT(REQUEST);
  const fmt = useFormat();
  const [statuses, setStatuses] = useState<Record<string, HandoffStatus>>({});
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState("");
  const poke = usePolling(async () => {
    const live = items.filter((i) => !["revoked", "expired"].includes(statuses[i.id] ?? ""));
    if (live.length === 0) return true;
    const entries = await Promise.all(live.map(async (i) => [i.id, (await sentStatus(i).catch(() => null))?.status] as const));
    const found = Object.fromEntries(entries.filter((e): e is readonly [string, HandoffStatus] => Boolean(e[1])));
    setStatuses((s) => ({ ...s, ...found }));
    return entries.some(([, s]) => s);
  }, 5000, items.length > 0);
  useEffect(() => {
    poke();
  }, [items, poke]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);
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
    <Card title={t("sent.title")} subtitle={t("sent.subtitle")}>
      <div className="space-y-2">
        {items.map((item) => {
          const status = statuses[item.id] ?? "stored";
          const live = status === "stored" || status === "opened";
          return (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-ink/[0.04] px-4 py-3 ring-1 ring-ink/10">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {fmt.bytes(item.size)} → {item.officeName}{" "}
                  {item.receiptOk && (
                    <Tip text={t("sent.receipt.tip")}>
                      <span tabIndex={0} className="cursor-help">
                        {t("sent.receipt")}
                      </span>
                    </Tip>
                  )}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-3">
                {live && (
                  <Tip text={t("sent.expires.tip")}>
                    <span tabIndex={0} className="cursor-help font-mono text-xs text-slate-400">
                      {t("sent.expires", { time: fmt.countdown(item.expiresAt, now) })}
                    </span>
                  </Tip>
                )}
                <StatusChip status={status} />
                {live && (
                  <Tipped when={busy !== item.id} text={t("sent.revoke.tip")}>
                    <Button variant="danger" onClick={() => revoke(item)} disabled={busy === item.id}>
                      {busy === item.id ? <Spinner /> : null} {t("sent.revoke")}
                    </Button>
                  </Tipped>
                )}
                {!live && (
                  <button
                    className="text-xs text-slate-500 hover:text-slate-300"
                    aria-label={t("sent.clear.label", { name: item.name })}
                    onClick={() => onChange(items.filter((i) => i.id !== item.id))}
                  >
                    {t("sent.clear")}
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
  const t = useT(REQUEST);
  const fmt = useFormat();
  const locale = useLocale();
  const label = useChecklistLabel();
  const { id = "" } = useParams();
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [bundleOk, setBundleOk] = useState<boolean | null>(null);
  const [error, setError] = useState<"" | "req.expired" | "req.invalid">("");
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
      .catch((e) => setError(e instanceof ApiError && e.status === 410 ? "req.expired" : "req.invalid"));
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
        setPending((p) => p.map((x, j) => (j === i ? { ...x, failed: true } : x)));
      }
    }
    updateSent([...results, ...sent]);
    setPending((p) => p.filter((x) => x.failed));
    setSending(false);
  }

  const office = request?.office.name ?? "";

  return (
    <Layout>
      {error && (
        <div role="alert">
          <Card title={t("req.unavailable")}>{t(error)}</Card>
        </div>
      )}
      {!request && !error && (
        <div role="status">
          <Card>{t("req.loading")}</Card>
        </div>
      )}
      {request && (
        <div className="space-y-5">
          <Card
            title={
              <span className="flex flex-wrap items-center gap-3">
                {t("req.asking", { office })} <VerifiedBadge verified={request.office.verified} />
              </span>
            }
            subtitle={request.office.domain}
            right={
              <div role="status" className="shrink-0">
                {bundleOk ? (
                  <Tip text={t("req.key.ok.tip", { office })}>
                    <span tabIndex={0} className="inline-flex rounded-full">
                      <Badge tone="green">{t("req.key.ok")}</Badge>
                    </span>
                  </Tip>
                ) : bundleOk === false ? (
                  <Tip text={t("req.key.bad.tip", { office })}>
                    <span tabIndex={0} className="inline-flex rounded-full">
                      <Badge tone="red">{t("req.key.bad")}</Badge>
                    </span>
                  </Tip>
                ) : (
                  <>
                    <Spinner />
                    <span className="sr-only">{t("req.key.checking")}</span>
                  </>
                )}
              </div>
            }
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">{t("req.need")}</p>
                <ul className="space-y-1">
                  {request.checklist.map((item) => (
                    <li key={item} className="text-sm text-slate-200">
                      <span aria-hidden="true">▸</span> {label(item)}
                    </li>
                  ))}
                </ul>
                {request.note && <p className="mt-3 rounded-lg bg-ink/5 px-3 py-2 text-sm text-slate-300">{t("req.note", { note: request.note })}</p>}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-400">
                  <span>{t("req.words")}</span>
                  <TipIcon text={t("req.words.tip")} label={t("req.words.label")} />
                </p>
                <SafetyWords words={request.office.safetyWords} />
                <p className="mt-3 text-xs text-slate-500">{t("req.onlyThem", { office })}</p>
              </div>
            </div>
          </Card>

          <Card title={t("add.title")} subtitle={t("add.subtitle")} right={<PqTag />}>
            <div
              role="button"
              tabIndex={0}
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
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                e.preventDefault();
                input.current?.click();
              }}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-saber bg-saber/5" : "border-ink/15 hover:border-ink/30"}`}
            >
              <p className="text-slate-300">{t("add.drop")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("add.drop.hint")}</p>
              <input ref={input} type="file" multiple hidden aria-label={t("add.input")} onChange={(e) => addFiles(e.target.files)} />
            </div>
            {pending.length > 0 && (
              <div className="mt-4 space-y-2">
                {pending.map((p, i) => {
                  const shown = p.trimmed?.file ?? p.file;
                  const found = p.doc ? findingsLine(p.doc, locale) : "";
                  return (
                    <div key={i} className="rounded-lg bg-ink/[0.04] px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="truncate">{shown.name}</span>
                        <span className="text-xs text-slate-500">{fmt.bytes(shown.size)}</span>
                        <span role="status" className={`ml-auto text-xs ${p.failed ? "text-sith" : "text-jedi-400"}`}>
                          {p.failed ? t("add.failed") : p.stage ? t(STAGE_KEY[p.stage]) : t("add.ready")}
                        </span>
                        {!sending && !p.stage && (
                          <button
                            className="text-xs text-slate-500 hover:text-ink"
                            aria-label={t("add.remove", { name: shown.name })}
                            onClick={() => setPending((x) => x.filter((_, j) => j !== i))}
                          >
                            <span aria-hidden="true">✕</span>
                          </button>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
                        {p.scanning && <span className="text-slate-500">{t("add.scanning")}</span>}
                        {p.trimmed && (
                          <>
                            <span className="text-saber">{t("add.trimmed", { result: resultLine(p.trimmed, locale) })}</span>
                            {!p.stage && (
                              <button className="text-slate-500 underline hover:text-ink" onClick={() => patch(p.file, { trimmed: undefined })}>
                                {t("add.undo")}
                              </button>
                            )}
                          </>
                        )}
                        {!p.trimmed && p.doc && !canTrim(p.doc) && <span className="text-slate-500">{trimNotes(p.doc, locale)[0]}</span>}
                        {!p.trimmed && p.doc && canTrim(p.doc) && (
                          <>
                            {found ? <span className="text-sith">{t("add.contains", { found })}</span> : <span className="text-slate-500">{t("add.clean")}</span>}
                            {!p.stage && (
                              <Tipped when={!trimming} text={t("add.trim.tip", { office })}>
                                <Button variant={found ? "danger" : "ghost"} className="px-2 py-0.5 text-xs" onClick={() => setTrimming(p.file)} data-action="trim">
                                  {t("add.trim")}
                                </Button>
                              </Tipped>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {untrimmed > 0 && !sending && <p className="text-xs text-amber-200">{t("add.untrimmed", { count: untrimmed, office })}</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Tipped when={!sending} text={t("add.seal.tip", { office })}>
                <Button variant="saber" onClick={sendAll} disabled={sending || pending.length === 0 || !bundleOk}>
                  {sending ? <Spinner /> : null} {t("add.seal")} {pending.length > 0 ? `(${pending.length})` : ""}
                </Button>
              </Tipped>
              <Tip text={t("ttl.tip")}>
                <select
                  aria-label={t("ttl.label")}
                  value={ttl}
                  onChange={(e) => setTtl(Number(e.target.value))}
                  className="rounded-lg bg-slate-950/80 px-3 py-2 text-sm ring-1 ring-ink/10"
                >
                  {TTL.map((m) => (
                    <option key={m} value={m}>
                      {t(`ttl.${m}`)}
                    </option>
                  ))}
                </select>
              </Tip>
            </div>
          </Card>

          <SentList items={sent} onChange={updateSent} />
          {trimming && trimDoc && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/80 p-4">
              <div role="dialog" aria-modal="true" aria-label={trimming.name} className="w-full max-w-3xl rounded-2xl bg-slate-900 p-5 ring-1 ring-ink/10">
                <TrimView
                  doc={trimDoc}
                  need={request.checklist.map(label)}
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
