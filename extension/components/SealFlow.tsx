import { useEffect, useRef, useState } from "react";
import { TrimView, canTrim, findingsLine, releaseDoc, resultLine, scanFile, sensitiveMarks, trimNotes, warmUp, type TrimDoc, type TrimResult } from "@oj/core/trim-ui";
import { FINDINGS, explainCheck } from "@oj/core/findings";
import { Tip, TipIcon, useLocale, useT } from "@oj/core/i18n/react";
import type { ThreadFlag } from "@/lib/messages";
import { newCode, officeTrusted, resolveRecipient, sealAndSend, stageLabel, type Recipient, type SentItem, type Stage } from "@/lib/seal";
import { safeHttpUrl } from "@/lib/api";
import { SEAL } from "@/locales/seal";
import { Badge, Button, Icon, SafetyWords, Section, Spinner, bytes, cx, rich } from "./ui";

const TTL = [
  { key: "ttl.2m", minutes: 2 },
  { key: "ttl.1d", minutes: 1440 },
  { key: "ttl.7d", minutes: 10080 },
  { key: "ttl.30d", minutes: 43200 },
] as const;

type ErrorKey = "failed";

interface Pending {
  file: File;
  stage?: Stage;
  error?: ErrorKey;
  scanning?: boolean;
  doc?: TrimDoc;
  trimmed?: TrimResult;
}

function ScanLine({ p, onTrim, onUndo }: { p: Pending; onTrim: () => void; onUndo: () => void }) {
  const t = useT(SEAL);
  const locale = useLocale();
  if (p.scanning) return <p className="text-[11px] text-slate-500">{t("scan.scanning")}</p>;
  if (p.trimmed) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-saber">
        {t("scan.trimmed", { result: resultLine(p.trimmed, locale) })}
        {!p.stage && (
          <button className="text-slate-500 underline hover:text-ink" onClick={onUndo}>
            {t("scan.undo")}
          </button>
        )}
      </p>
    );
  }
  if (!p.doc) return null;
  const found = findingsLine(p.doc, locale);
  if (!canTrim(p.doc)) return <p className="text-[11px] text-slate-500">{trimNotes(p.doc, locale)[0]}</p>;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {found ? <span className="text-sith">{t("scan.contains", { found })}</span> : <span className="text-slate-500">{t("scan.none")}</span>}
      {!p.stage && (
        <Tip text={t("scan.trim.tip")}>
          <button className={cx("rounded px-1.5 py-0.5 font-medium", found ? "bg-sith/90 text-ink hover:bg-sith" : "bg-ink/10 text-slate-200 hover:bg-ink/15")} onClick={onTrim} data-action="trim">
            {t("scan.trim")}
          </button>
        </Tip>
      )}
    </p>
  );
}

const DNS_BADGE = {
  match: { tone: "green", key: "dns.match" },
  missing: { tone: "amber", key: "dns.missing" },
  mismatch: { tone: "red", key: "dns.mismatch" },
  error: { tone: "amber", key: "dns.error" },
} as const;

function RecipientStatus({ recipient }: { recipient: Recipient }) {
  const t = useT(SEAL);
  if (recipient.kind === "person") {
    return (
      <div className="space-y-1 text-xs text-slate-300">
        <p>
          <Tip text={t("person.badge.tip")}>
            <Badge tone="blue" tabIndex={0}>
              {t("person.badge")}
            </Badge>
          </Tip>{" "}
          {rich(t("person.body"), { code: <b>{t("person.code")}</b> })}
        </p>
        <p className="text-slate-500">{t("person.burn")}</p>
      </div>
    );
  }
  const { office, sigOk, dns } = recipient;
  const dnsBadge = DNS_BADGE[dns];
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-ink">{office.name}</span>
        <span className="font-mono text-slate-400">{office.domain}</span>
        <TipIcon text={t("office.tip")} label={t("office.tipLabel")} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Tip text={t(sigOk ? "sig.ok.tip" : "sig.bad.tip")}>
          <Badge tone={sigOk ? "green" : "red"} tabIndex={0}>
            {t(sigOk ? "sig.ok" : "sig.bad")}
          </Badge>
        </Tip>
        <Tip text={t(`${dnsBadge.key}.tip`)}>
          <Badge tone={dnsBadge.tone} tabIndex={0}>
            {t(dnsBadge.key)}
          </Badge>
        </Tip>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1.5 text-slate-400">
          {t("words.title")}
          <TipIcon text={t("words.tip")} label={t("words.tipLabel")} />
        </p>
        <SafetyWords words={office.safetyWords} />
      </div>
    </div>
  );
}

export function SealFlow({
  recipients = [],
  flag,
  onSealed,
  onClose,
}: {
  recipients?: string[];
  flag?: ThreadFlag;
  onSealed: (items: SentItem[], code?: string) => void;
  onClose?: () => void;
}) {
  const t = useT(SEAL);
  const tf = useT(FINDINGS);
  const locale = useLocale();
  const [input, setInput] = useState(recipients[0] ?? "");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(false);
  const [wordsOk, setWordsOk] = useState(false);
  const [override, setOverride] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [ttl, setTtl] = useState(10080);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ items: SentItem[]; code?: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const [trimming, setTrimming] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const docs = useRef<TrimDoc[]>([]);

  useEffect(() => {
    warmUp();
    return () => docs.current.forEach(releaseDoc);
  }, []);

  const update = (file: File, patch: Partial<Pending>) => setPending((p) => p.map((x) => (x.file === file ? { ...x, ...patch } : x)));

  function addFiles(files: File[]) {
    setPending((p) => [...p, ...files.map((file) => ({ file, scanning: true }))]);
    for (const file of files) {
      scanFile(file)
        .then((doc) => {
          docs.current.push(doc);
          update(file, { doc, scanning: false });
        })
        .catch(() => update(file, { scanning: false }));
    }
  }

  const trimDoc = trimming ? pending.find((p) => p.file === trimming)?.doc : undefined;
  const untrimmed = pending.filter((p) => !p.trimmed && p.doc && sensitiveMarks(p.doc).length > 0).length;

  useEffect(() => {
    const value = input.trim();
    setRecipient(null);
    setWordsOk(false);
    setResolveError(false);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$|^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return;
    let alive = true;
    setResolving(true);
    const timer = setTimeout(() => {
      resolveRecipient(value)
        .then((r) => alive && setRecipient(r))
        .catch(() => alive && setResolveError(true))
        .finally(() => alive && setResolving(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [input]);

  const flagged = flag?.verdict === "mismatch";
  const blocked =
    !recipient ||
    (recipient.kind === "office" && (!recipient.sigOk || recipient.dns === "mismatch")) ||
    (recipient.kind === "office" && !officeTrusted(recipient) && !wordsOk) ||
    (flagged && !override);

  async function seal() {
    if (!recipient || blocked) return;
    setSending(true);
    const code = recipient.kind === "person" ? newCode() : undefined;
    const items: SentItem[] = [];
    for (let i = 0; i < pending.length; i++) {
      const setStage = (stage: Stage) => setPending((p) => p.map((x, j) => (j === i ? { ...x, stage } : x)));
      try {
        const p = pending[i]!;
        items.push(await sealAndSend(p.trimmed?.file ?? p.file, recipient, ttl, code, setStage, p.trimmed?.summary));
      } catch {
        setPending((p) => p.map((x, j) => (j === i ? { ...x, error: "failed" } : x)));
      }
    }
    setSending(false);
    if (items.length) {
      setDone({ items, code });
      onSealed(items, code);
    }
  }

  if (done) {
    const first = done.items[0];
    return (
      <div className="space-y-3">
        <Section title={t("done.title")}>
          <ul className="space-y-1 text-sm">
            {done.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <Icon name="lock" className="h-3.5 w-3.5 text-neel-600" />
                <span className="truncate">{item.name}</span>
                <span className="text-xs text-slate-500">{bytes(item.size, locale)}</span>
                {item.receiptOk && (
                  <Tip text={t("done.receipt.tip")}>
                    <Badge tone="green" tabIndex={0}>
                      {t("done.receipt")}
                    </Badge>
                  </Tip>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            {t("done.linkOnly")} {first?.mode === "office" ? t("done.office", { office: first?.officeName }) : t("done.person")}
          </p>
        </Section>
        {done.code && (
          <Section title={t("code.title")} right={<TipIcon text={t("code.tip")} label={t("code.tipLabel")} className="text-ink-3" />} className="ring-amber-300/40">
            <p className="text-center font-mono text-3xl tracking-[0.3em] text-amber-200">{done.code}</p>
            <p className="mt-2 text-xs text-slate-400">{t("code.body")}</p>
          </Section>
        )}
        {onClose && (
          <Button variant="saber" className="w-full" onClick={onClose}>
            {t("done.button")}
          </Button>
        )}
      </div>
    );
  }

  const portal = safeHttpUrl(flag?.officialUploadUrl);

  if (trimming && trimDoc) {
    return (
      <TrimView
        doc={trimDoc}
        onCancel={() => setTrimming(null)}
        onDone={(result) => {
          update(trimming, { trimmed: result });
          setTrimming(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {flagged && flag && (
        <Section className="bg-sith/10 ring-sith/50">
          <p className="text-sm font-semibold text-sith">{t("flag.failed")}</p>
          <p className="mt-1 text-xs text-slate-200">{flag.localized ? explainCheck(flag, locale) : flag.explanation}</p>
          {(flag.officialPhone || portal || flag.officialDomain) && (
            <p className="mt-2 text-xs text-slate-300">
              {tf("card.useOfficialChannel")}
              {flag.officialPhone && <span className="ml-1 font-mono text-ink">{tf("card.tel", { phone: flag.officialPhone })}</span>}
              {portal ? (
                <a className="ml-2 text-jedi-400 underline" href={portal} target="_blank" rel="noopener noreferrer">
                  {t("flag.portal")}
                </a>
              ) : (
                flag.officialDomain && <span className="ml-2 font-mono text-jedi-400">{flag.officialDomain}</span>
              )}
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            {t("flag.override")}
          </label>
        </Section>
      )}

      <Section title={t("to.title")}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("to.placeholder")}
          aria-label={t("to.label")}
          className="w-full rounded-lg bg-slate-950/80 px-3 py-1.5 text-sm text-slate-100 ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
        />
        {recipients.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {recipients.map((r) => (
              <button
                key={r}
                onClick={() => setInput(r)}
                aria-pressed={r === input}
                className={cx("rounded-full px-2 py-0.5 text-[11px] ring-1", r === input ? "bg-jedi-500/20 text-jedi-400 ring-jedi-400/40" : "text-slate-400 ring-ink/10")}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2" aria-live="polite">
          {resolving && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Spinner /> {t("resolving")}
            </p>
          )}
          {resolveError && (
            <p role="alert" className="text-xs text-sith">
              {t("resolveError")}
            </p>
          )}
          {recipient && <RecipientStatus recipient={recipient} />}
          {recipient?.kind === "office" && recipient.sigOk && recipient.dns !== "mismatch" && !officeTrusted(recipient) && (
            <label className="mt-2 flex items-start gap-2 text-xs text-amber-200">
              <input type="checkbox" className="mt-0.5" checked={wordsOk} onChange={(e) => setWordsOk(e.target.checked)} />
              {t("words.confirm")}
            </label>
          )}
          {recipient?.kind === "office" && recipient.dns === "mismatch" && <p className="mt-2 text-xs text-sith">{t("dns.blocked")}</p>}
        </div>
      </Section>

      <Section
        title={t("docs.title")}
        right={
          <Tip text={t("docs.suite.tip")}>
            <Badge tone="blue" tabIndex={0}>
              HANDOFF-PQ1
            </Badge>
          </Tip>
        }
      >
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
            addFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => picker.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              picker.current?.click();
            }
          }}
          className={cx("cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition", drag ? "border-saber bg-saber/5" : "border-ink/15 hover:border-ink/30")}
        >
          <p className="text-sm text-slate-300">{t("drop.title")}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{t("drop.note")}</p>
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              addFiles(picked);
            }}
          />
        </div>
        {pending.length > 0 && (
          <div className="mt-2 space-y-1">
            {pending.map((p, i) => {
              const name = (p.trimmed?.file ?? p.file).name;
              return (
                <div key={i} className="rounded-md bg-ink/[0.04] px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 text-slate-500">{bytes((p.trimmed?.file ?? p.file).size, locale)}</span>
                    <span role="status" className={cx("ml-auto min-w-0 text-right", p.error ? "text-sith" : "text-jedi-400")}>
                      {p.error ? t(p.error) : p.stage ? stageLabel(p.stage, locale) : t("ready")}
                    </span>
                    {!sending && !p.stage && (
                      <button className="shrink-0 text-slate-500 hover:text-ink" aria-label={t("remove", { name })} onClick={() => setPending((x) => x.filter((_, j) => j !== i))}>
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </div>
                  <ScanLine p={p} onTrim={() => setTrimming(p.file)} onUndo={() => update(p.file, { trimmed: undefined })} />
                </div>
              );
            })}
            {untrimmed > 0 && !sending && <p className="text-[11px] text-amber-200">{t("untrimmed", { count: untrimmed })}</p>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tip text={t("seal.tip")}>
            <Button variant="saber" data-action="seal" onClick={seal} disabled={sending || pending.length === 0 || blocked}>
              {sending ? <Spinner /> : <Icon name="lock" className="h-4 w-4" />} {pending.length > 1 ? t("seal.many", { count: pending.length }) : t("seal.one")}
            </Button>
          </Tip>
          <Tip text={t("ttl.tip")}>
            <select
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
              aria-label={t("ttl.label")}
              className="min-w-0 max-w-full rounded-lg bg-slate-950/80 px-2 py-1.5 text-xs ring-1 ring-ink/10"
            >
              {TTL.map((o) => (
                <option key={o.minutes} value={o.minutes}>
                  {t("ttl.option", { label: t(o.key) })}
                </option>
              ))}
            </select>
          </Tip>
        </div>
      </Section>
    </div>
  );
}
