import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { KIND_LABEL, SENSITIVE_KINDS, describeFindings } from "./detect";
import { analyzeFile, applyTrim, manualMark, releaseDoc, renderPage, type Mark, type Rect, type TrimDoc, type TrimResult } from "./trim";
import type { FindingKind } from "./types";

export { releaseDoc, warmUp } from "./trim";
export type { TrimDoc, TrimResult } from "./trim";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const scanFile = async (file: File) => analyzeFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()));

export const sensitiveMarks = (doc: TrimDoc) => doc.marks.filter((m) => m.kind && SENSITIVE_KINDS.includes(m.kind));

export const findingsLine = (doc: TrimDoc) => describeFindings(sensitiveMarks(doc) as { kind: FindingKind }[]);

export const canTrim = (doc: TrimDoc) => doc.kind !== "other";

export function resultLine(r: TrimResult) {
  const parts = [describeFindings(Object.entries(r.summary.removed).flatMap(([kind, n]) => Array.from({ length: n ?? 0 }, () => ({ kind: kind as FindingKind }))))];
  if (r.summary.pagesRemoved) parts.push(`${r.summary.pagesRemoved} page${r.summary.pagesRemoved > 1 ? "s" : ""} dropped`);
  if (r.summary.metadataRemoved) parts.push("metadata stripped");
  return parts.filter(Boolean).join(" · ") || "Flattened";
}

function mask(value = "") {
  if (value.includes("@")) return `${value[0]}•••@${value.split("@")[1]}`;
  const tail = value.replace(/[^\dA-Za-z]/g, "").slice(-4);
  return `•••${tail}`;
}

function PageView({
  doc,
  index,
  scale,
  marks,
  keep,
  drawing,
  onToggle,
  onDraw,
  onKeep,
}: {
  doc: TrimDoc;
  index: number;
  scale: number;
  marks: Mark[];
  keep: boolean;
  drawing: boolean;
  onToggle: (id: string) => void;
  onDraw: (rect: Rect) => void;
  onKeep: (keep: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const page = doc.pages[index]!;

  useEffect(() => {
    if (canvas.current) renderPage(doc, index, canvas.current, scale).catch(() => {});
  }, [doc, index, scale]);

  const point = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Page {index + 1}
          {doc.pages.length > 1 && ` of ${doc.pages.length}`}
        </span>
        {doc.kind === "pdf" && doc.pages.length > 1 && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={keep} onChange={(e) => onKeep(e.target.checked)} />
            Send this page
          </label>
        )}
      </div>
      <div className="relative inline-block overflow-hidden rounded-md bg-white shadow ring-1 ring-ink/10" style={{ width: page.width * scale, height: page.height * scale }}>
        <canvas ref={canvas} className="block" />
        <div
          className={cx("absolute inset-0", drawing && keep ? "cursor-crosshair" : "")}
          onPointerDown={(e) => {
            if (!drawing || !keep) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = point(e);
            setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => {
            if (!draft) return;
            const p = point(e);
            setDraft({ ...draft, x1: p.x, y1: p.y });
          }}
          onPointerUp={() => {
            if (!draft) return;
            const rect = { x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1), w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0) };
            setDraft(null);
            if (rect.w * scale > 6 && rect.h * scale > 6) onDraw(rect);
          }}
        >
          {marks.flatMap((m) =>
            m.rects.map((r, i) => (
              <button
                key={`${m.id}-${i}`}
                type="button"
                title={m.kind ? `${KIND_LABEL[m.kind][0]}: click to ${m.selected ? "keep" : "remove"}` : "Your box: click to remove"}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!drawing) onToggle(m.id);
                }}
                className={cx(
                  "absolute rounded-[2px] transition",
                  m.selected ? "bg-black ring-2 ring-sith" : "bg-sith/10 ring-2 ring-sith/70 ring-dashed",
                  drawing && "pointer-events-none",
                )}
                style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale }}
              />
            )),
          )}
          {draft && (
            <div
              className="absolute bg-black/80 ring-2 ring-sith"
              style={{ left: Math.min(draft.x0, draft.x1) * scale, top: Math.min(draft.y0, draft.y1) * scale, width: Math.abs(draft.x1 - draft.x0) * scale, height: Math.abs(draft.y1 - draft.y0) * scale }}
            />
          )}
          {!keep && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm font-medium text-slate-300">Not sent</div>}
        </div>
      </div>
    </div>
  );
}

function TextView({ doc, marks, onToggle }: { doc: TrimDoc; marks: Mark[]; onToggle: (id: string) => void }) {
  const text = doc.text ?? "";
  const parts: { text: string; mark?: Mark }[] = [];
  let cursor = 0;
  for (const m of [...marks].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) {
    if (m.start === undefined || m.end === undefined || m.start < cursor) continue;
    parts.push({ text: text.slice(cursor, m.start) }, { text: text.slice(m.start, m.end), mark: m });
    cursor = m.end;
  }
  parts.push({ text: text.slice(cursor) });
  return (
    <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs text-slate-900">
      {parts.map((p, i) =>
        p.mark ? (
          <button
            key={i}
            type="button"
            onClick={() => onToggle(p.mark!.id)}
            className={cx("rounded-sm px-0.5", p.mark.selected ? "bg-black text-black ring-1 ring-sith" : "bg-red-100 text-red-700 underline decoration-dashed")}
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </pre>
  );
}

function OutputPreview({ file }: { file: File }) {
  const [doc, setDoc] = useState<TrimDoc | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let loaded: TrimDoc | null = null;
    scanFile(file).then((d) => {
      loaded = d;
      if (alive) setDoc(d);
    });
    return () => {
      alive = false;
      if (loaded) releaseDoc(loaded);
    };
  }, [file]);
  useEffect(() => {
    if (doc && canvas.current && doc.pages[0]) renderPage(doc, 0, canvas.current, Math.min(0.5, 220 / doc.pages[0].width)).catch(() => {});
  }, [doc]);
  if (!doc) return null;
  if (doc.kind === "text") return <pre className="max-h-40 overflow-auto rounded-md bg-white p-2 font-mono text-[10px] text-slate-900">{doc.text?.slice(0, 1200)}</pre>;
  return <canvas ref={canvas} className="rounded-md shadow ring-1 ring-ink/10" />;
}

export function TrimView({ doc: initial, need, onDone, onCancel }: { doc: TrimDoc; need?: string[]; onDone: (r: TrimResult) => void; onCancel: () => void }) {
  const [doc, setDoc] = useState(initial);
  const [keep, setKeep] = useState<number[]>(() => initial.pages.map((p) => p.index));
  const [drawing, setDrawing] = useState(initial.marks.length === 0 && initial.kind !== "text");
  const [width, setWidth] = useState(480);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TrimResult | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const widest = Math.max(1, ...doc.pages.map((p) => p.width));
  const scale = Math.min(1.4, (width - 4) / widest);
  const toggle = (id: string) => setDoc((d) => ({ ...d, marks: d.marks.map((m) => (m.id === id ? (m.manual ? { ...m, selected: false } : { ...m, selected: !m.selected }) : m)).filter((m) => !(m.manual && !m.selected)) }));
  const found = doc.marks.filter((m) => !m.manual);
  const manual = doc.marks.filter((m) => m.manual);
  const selectedCount = doc.marks.filter((m) => m.selected && keep.includes(m.page)).length;

  async function apply() {
    setBusy(true);
    setError("");
    try {
      setResult(await applyTrim(doc, keep));
    } catch {
      setError("Trim failed on this file. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const v = result.verification;
    return (
      <div className="space-y-3">
        <div className={cx("rounded-xl p-3 ring-2", v.ok ? "bg-saber/5 ring-saber/50" : "bg-sith/10 ring-sith/60")}>
          <p className={cx("text-base font-semibold", v.ok ? "text-saber" : "text-sith")}>{v.ok ? "✓ Verified redacted" : "✕ Verification failed: don't send this"}</p>
          <p className="mt-1 text-xs text-slate-300">Re-scanned on this device after trimming:</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-200">
            {doc.kind === "pdf" && <li>{v.textChars === 0 ? "✓ no selectable text left" : `${v.textChars} characters of text left`}</li>}
            <li>{v.leaks === 0 ? "✓ 0 removed values found again" : `✕ ${v.leaks} removed values still present`}</li>
            {v.boxesChecked > 0 && (
              <li>
                {v.boxesOpaque === v.boxesChecked ? "✓" : "✕"} {v.boxesOpaque}/{v.boxesChecked} boxes solid black
              </li>
            )}
            {doc.hasMetadata && <li>{v.metadataClean ? "✓ metadata removed" : "✕ metadata still present"}</li>}
            <li>
              {v.pages} page{v.pages === 1 ? "" : "s"} · {(v.ms / 1000).toFixed(1)}s · offline
            </li>
          </ul>
          <p className="mt-2 text-xs text-slate-400">{resultLine(result)}</p>
        </div>
        <div className="flex items-start gap-3">
          <OutputPreview file={result.file} />
          <p className="text-xs text-slate-400">
            This is what will be sealed: <span className="font-mono text-slate-200">{result.file.name}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!v.ok} onClick={() => onDone(result)} className="rounded-lg bg-saber/90 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-saber disabled:opacity-50">
            Use trimmed file
          </button>
          <button type="button" onClick={() => setResult(null)} className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-slate-200 ring-1 ring-ink/10 hover:bg-ink/10">
            Adjust
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Trim · send only what they need</p>
          <p className="truncate text-xs text-slate-400">{doc.name}</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded px-2 text-slate-400 hover:bg-ink/10 hover:text-ink" aria-label="Cancel">
          ✕
        </button>
      </div>

      {need && need.length > 0 && (
        <p className="text-xs text-slate-300">
          They asked for: <span className="text-ink">{need.join(", ")}</span>. Remove anything else.
        </p>
      )}
      {doc.notes.map((n) => (
        <p key={n} className="rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-200 ring-1 ring-amber-300/20">
          {n}
        </p>
      ))}

      {found.length > 0 && (
        <div className="rounded-lg bg-slate-900/70 p-2 ring-1 ring-ink/10">
          <p className="mb-1 text-xs text-slate-400">
            Found on this device: <span className="text-ink">{findingsLine(doc) || `${found.length} contact details`}</span>
          </p>
          <div className="max-h-32 space-y-0.5 overflow-auto">
            {found.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={m.selected} onChange={() => toggle(m.id)} />
                <span className={m.kind && SENSITIVE_KINDS.includes(m.kind) ? "text-sith" : "text-slate-300"}>{m.kind ? KIND_LABEL[m.kind][0] : "Box"}</span>
                <span className="font-mono text-slate-400">{mask(m.value)}</span>
                {m.sample && <span className="rounded bg-ink/10 px-1 text-[10px] text-slate-300">SAMPLE</span>}
                {doc.pages.length > 1 && <span className="ml-auto text-slate-500">p.{m.page + 1}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {doc.kind !== "text" && doc.kind !== "other" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setDrawing(!drawing)}
            className={cx("rounded-lg px-2.5 py-1 ring-1", drawing ? "bg-sith/20 text-ink ring-sith/60" : "bg-ink/5 text-slate-200 ring-ink/10 hover:bg-ink/10")}
          >
            ✎ {drawing ? "Drawing: drag over anything to hide" : "Draw a box"}
          </button>
          {manual.length > 0 && (
            <button type="button" onClick={() => setDoc((d) => ({ ...d, marks: d.marks.filter((m) => !m.manual) }))} className="text-slate-400 underline hover:text-ink">
              Clear {manual.length} drawn box{manual.length > 1 ? "es" : ""}
            </button>
          )}
          <span className="text-slate-500">Click a box to keep or remove it.</span>
        </div>
      )}

      <div ref={wrap} className="max-h-[60vh] space-y-4 overflow-auto pr-1">
        {doc.kind === "text" && <TextView doc={doc} marks={doc.marks} onToggle={toggle} />}
        {(doc.kind === "pdf" || doc.kind === "image") &&
          doc.pages.map((p) => (
            <PageView
              key={p.index}
              doc={doc}
              index={p.index}
              scale={scale}
              marks={doc.marks.filter((m) => m.page === p.index)}
              keep={keep.includes(p.index)}
              drawing={drawing}
              onToggle={toggle}
              onDraw={(rect) => setDoc((d) => ({ ...d, marks: [...d.marks, manualMark(p.index, rect)] }))}
              onKeep={(k) => setKeep((ks) => (k ? [...ks, p.index] : ks.filter((x) => x !== p.index)))}
            />
          ))}
      </div>

      {error && <p className="text-xs text-sith">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={busy || doc.kind === "other" || keep.length === 0}
          className="rounded-lg bg-saber/90 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-saber disabled:opacity-50"
        >
          {busy ? "Flattening and re-scanning…" : `Trim & verify${selectedCount ? ` (${selectedCount} hidden)` : ""}`}
        </button>
        <span className="text-[11px] text-slate-500">Runs entirely on this device. Works offline.</span>
      </div>
    </div>
  );
}
