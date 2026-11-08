import { useEffect, useRef, useState } from "react";
import { TrimView, canTrim, findingsLine, releaseDoc, resultLine, scanFile, sensitiveMarks, warmUp, type TrimDoc, type TrimResult } from "@oj/core/trim-ui";
import type { ThreadFlag } from "@/lib/messages";
import { STAGE_LABEL, newCode, officeTrusted, resolveRecipient, sealAndSend, type Recipient, type SentItem, type Stage } from "@/lib/seal";
import { safeHttpUrl } from "@/lib/api";
import { Badge, Button, Icon, SafetyWords, Section, Spinner, bytes, cx } from "./ui";

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

function ScanLine({ p, onTrim, onUndo }: { p: Pending; onTrim: () => void; onUndo: () => void }) {
  if (p.scanning) return <p className="text-[11px] text-slate-500">Scanning on this device…</p>;
  if (p.trimmed) {
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-saber">
        ✓ Trimmed and verified · {resultLine(p.trimmed)}
        {!p.stage && (
          <button className="text-slate-500 underline hover:text-ink" onClick={onUndo}>
            undo
          </button>
        )}
      </p>
    );
  }
  if (!p.doc) return null;
  const found = findingsLine(p.doc);
  if (!canTrim(p.doc)) return <p className="text-[11px] text-slate-500">{p.doc.notes[0]}</p>;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {found ? <span className="text-sith">Contains {found}</span> : <span className="text-slate-500">No ID or account numbers found</span>}
      {!p.stage && (
        <button className={cx("rounded px-1.5 py-0.5 font-medium", found ? "bg-sith/90 text-ink hover:bg-sith" : "bg-ink/10 text-slate-200 hover:bg-ink/15")} onClick={onTrim} data-action="trim">
          Trim
        </button>
      )}
    </p>
  );
}

function RecipientStatus({ recipient }: { recipient: Recipient }) {
  if (recipient.kind === "person") {
    return (
      <div className="space-y-1 text-xs text-slate-300">
        <p>
          <Badge tone="blue">Person mode</Badge> Not a registered office, so you'll get a <b>6-digit code</b>. Send it another way (text or call), never in the same email.
        </p>
        <p className="text-slate-500">Opening needs the link and the code, and the code burns after 5 wrong tries.</p>
      </div>
    );
  }
  const { office, sigOk, dns } = recipient;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-ink">{office.name}</span>
        <span className="font-mono text-slate-400">{office.domain}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sigOk ? <Badge tone="green">✓ ML-DSA key signature</Badge> : <Badge tone="red">✕ Key signature invalid</Badge>}
        {dns === "match" && <Badge tone="green">✓ DNS fingerprint (checked by your browser)</Badge>}
        {dns === "missing" && <Badge tone="amber">No DNS fingerprint published</Badge>}
        {dns === "mismatch" && <Badge tone="red">✕ DNS fingerprint doesn't match</Badge>}
        {dns === "error" && <Badge tone="amber">DNS lookup failed</Badge>}
      </div>
      <div>
        <p className="mb-1 text-slate-400">Safety words: ask the office to read these back</p>
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
  const [input, setInput] = useState(recipients[0] ?? "");
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
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
    setResolveError("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$|^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value)) return;
    let alive = true;
    setResolving(true);
    const t = setTimeout(() => {
      resolveRecipient(value)
        .then((r) => alive && setRecipient(r))
        .catch(() => alive && setResolveError("Couldn't reach Avaran to look up this recipient."))
        .finally(() => alive && setResolving(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
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
        setPending((p) => p.map((x, j) => (j === i ? { ...x, error: "Failed. Nothing readable was sent." } : x)));
      }
    }
    setSending(false);
    if (items.length) {
      setDone({ items, code });
      onSealed(items, code);
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <Section title="Sealed">
          <ul className="space-y-1 text-sm">
            {done.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <Icon name="lock" className="h-3.5 w-3.5 text-neel-600" />
                <span className="truncate">{item.name}</span>
                <span className="text-xs text-slate-500">{bytes(item.size)}</span>
                {item.receiptOk && <Badge tone="green">receipt ✓</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            Only a link leaves this window. {done.items[0]?.mode === "office" ? `Only ${done.items[0]?.officeName}'s private key can open it.` : "The link alone can't open it."}
          </p>
        </Section>
        {done.code && (
          <Section title="Pickup code: send it separately" className="ring-amber-300/40">
            <p className="text-center font-mono text-3xl tracking-[0.3em] text-amber-200">{done.code}</p>
            <p className="mt-2 text-xs text-slate-400">Text or call this code to the recipient. Never paste it into the same email. 5 wrong tries destroy the document.</p>
          </Section>
        )}
        {onClose && (
          <Button variant="saber" className="w-full" onClick={onClose}>
            Done
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
          <p className="text-sm font-semibold text-sith">✕ This conversation failed "Who's asking?"</p>
          <p className="mt-1 text-xs text-slate-200">{flag.explanation}</p>
          {(flag.officialPhone || portal || flag.officialDomain) && (
            <p className="mt-2 text-xs text-slate-300">
              Use the official channel instead:
              {flag.officialPhone && <span className="ml-1 font-mono text-ink">Tel. {flag.officialPhone}</span>}
              {portal ? (
                <a className="ml-2 text-jedi-400 underline" href={portal} target="_blank" rel="noopener noreferrer">
                  official portal ↗
                </a>
              ) : (
                flag.officialDomain && <span className="ml-2 font-mono text-jedi-400">{flag.officialDomain}</span>
              )}
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />I understand the risk and still want to seal this
          </label>
        </Section>
      )}

      <Section title="Sealed for">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="office@domain.com or domain.com"
          className="w-full rounded-lg bg-slate-950/80 px-3 py-1.5 text-sm text-slate-100 ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
        />
        {recipients.length > 1 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {recipients.map((r) => (
              <button key={r} onClick={() => setInput(r)} className={cx("rounded-full px-2 py-0.5 text-[11px] ring-1", r === input ? "bg-jedi-500/20 text-jedi-400 ring-jedi-400/40" : "text-slate-400 ring-ink/10")}>
                {r}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2">
          {resolving && (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Spinner /> Checking the office key and DNS…
            </p>
          )}
          {resolveError && <p className="text-xs text-sith">{resolveError}</p>}
          {recipient && <RecipientStatus recipient={recipient} />}
          {recipient?.kind === "office" && recipient.sigOk && recipient.dns !== "mismatch" && !officeTrusted(recipient) && (
            <label className="mt-2 flex items-start gap-2 text-xs text-amber-200">
              <input type="checkbox" className="mt-0.5" checked={wordsOk} onChange={(e) => setWordsOk(e.target.checked)} />
              The office hasn't proven its domain yet. I confirmed these 6 words with them by phone.
            </label>
          )}
          {recipient?.kind === "office" && recipient.dns === "mismatch" && (
            <p className="mt-2 text-xs text-sith">The office's DNS record points to a different key. Someone may be impersonating it, so sealing is blocked.</p>
          )}
        </div>
      </Section>

      <Section title="Documents" right={<Badge tone="blue">HANDOFF-PQ1</Badge>}>
        <div
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
          className={cx("cursor-pointer rounded-lg border-2 border-dashed px-4 py-5 text-center transition", drag ? "border-saber bg-saber/5" : "border-ink/15 hover:border-ink/30")}
        >
          <p className="text-sm text-slate-300">Drop files or click to choose</p>
          <p className="mt-0.5 text-[11px] text-slate-500">The file is opened inside Avaran. The web page around it never sees it.</p>
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
            {pending.map((p, i) => (
              <div key={i} className="rounded-md bg-ink/[0.04] px-2 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="truncate">{(p.trimmed?.file ?? p.file).name}</span>
                  <span className="text-slate-500">{bytes((p.trimmed?.file ?? p.file).size)}</span>
                  <span className={cx("ml-auto shrink-0", p.error ? "text-sith" : "text-jedi-400")}>{p.error ?? (p.stage ? STAGE_LABEL[p.stage] : "Ready")}</span>
                  {!sending && !p.stage && (
                    <button className="text-slate-500 hover:text-ink" onClick={() => setPending((x) => x.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </div>
                <ScanLine p={p} onTrim={() => setTrimming(p.file)} onUndo={() => update(p.file, { trimmed: undefined })} />
              </div>
            ))}
            {untrimmed > 0 && !sending && (
              <p className="text-[11px] text-amber-200">
                {untrimmed === 1 ? "1 file still has" : `${untrimmed} files still have`} sensitive numbers. Trim sends only what they need; you can also seal as is.
              </p>
            )}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="saber" data-action="seal" onClick={seal} disabled={sending || pending.length === 0 || blocked}>
            {sending ? <Spinner /> : <Icon name="lock" className="h-4 w-4" />} Seal {pending.length > 1 ? `${pending.length} files` : ""}
          </Button>
          <select value={ttl} onChange={(e) => setTtl(Number(e.target.value))} className="rounded-lg bg-slate-950/80 px-2 py-1.5 text-xs ring-1 ring-ink/10">
            {TTL.map((t) => (
              <option key={t.minutes} value={t.minutes}>
                Self-destruct after {t.label}
              </option>
            ))}
          </select>
        </div>
      </Section>
    </div>
  );
}
