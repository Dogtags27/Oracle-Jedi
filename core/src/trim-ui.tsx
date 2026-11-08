import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { KIND_ORDER, SENSITIVE_KINDS, countKinds } from "./detect";
import { FINDINGS, describeKinds, kindLabel } from "./findings";
import { languageName, translator, type Locale } from "./i18n";
import { Tip, useFormat, useLocale, useT } from "./i18n/react";
import { TRIM } from "./locales/trim";
import { analyzeFile, applyTrim, manualMark, releaseDoc, renderPage, type Mark, type Rect, type TrimDoc, type TrimResult } from "./trim";
import type { FindingKind } from "./types";

export { releaseDoc, warmUp } from "./trim";
export type { TrimDoc, TrimResult } from "./trim";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const ORDER: FindingKind[] = KIND_ORDER.filter((k) => SENSITIVE_KINDS.includes(k));

export const scanFile = async (file: File) => analyzeFile(file.name, file.type, new Uint8Array(await file.arrayBuffer()));

export const sensitiveMarks = (doc: TrimDoc) => doc.marks.filter((m) => m.kind && SENSITIVE_KINDS.includes(m.kind));

export const findingsLine = (doc: TrimDoc, locale: Locale = "en") => describeKinds(countKinds(sensitiveMarks(doc) as { kind: FindingKind }[]), ORDER, locale);

export const canTrim = (doc: TrimDoc) => doc.kind !== "other";

export function trimNotes(doc: TrimDoc, locale: Locale = "en"): string[] {
  if (!doc.noteKeys?.length) return doc.notes;
  const t = translator(TRIM, locale);
  return doc.noteKeys.map((k) => t(`note.${k}`));
}

export function resultLine(r: TrimResult, locale: Locale = "en") {
  const t = translator(TRIM, locale);
  const parts = [describeKinds(r.summary.removed, ORDER, locale)];
  if (r.summary.pagesRemoved) parts.push(t("result.pagesDropped", { count: r.summary.pagesRemoved }));
  if (r.summary.metadataRemoved) parts.push(t("result.metadata"));
  return parts.filter(Boolean).join(" · ") || t("result.flattened");
}

function mask(value = "") {
  if (value.includes("@")) return `${value[0]}•••@${value.split("@")[1]}`;
  const tail = value.replace(/[^\dA-Za-z]/g, "").slice(-4);
  return `•••${tail}`;
}

const leading = (s: string, locale: Locale) => (locale === "en" ? s : s.charAt(0).toLocaleUpperCase(locale) + s.slice(1));

function fill(template: string, name: string, node: ReactNode) {
  const [before, after] = template.split(`{${name}}`);
  return (
    <>
      {before}
      {node}
      {after}
    </>
  );
}

function useMarkText() {
  const locale = useLocale();
  const t = useT(TRIM);
  const kindName = (kind: FindingKind) => leading(kindLabel(kind, locale), locale);
  return {
    kindName,
    title: (m: Mark) => (m.kind ? t(m.selected ? "mark.title.keep" : "mark.title.remove", { kind: kindName(m.kind) }) : t("mark.title.box")),
    aria: (m: Mark) => (m.kind ? t(m.selected ? "mark.aria.removing" : "mark.aria.keeping", { kind: kindName(m.kind) }) : t("mark.aria.box")),
    chip: (m: Mark) =>
      [m.kind ? t(`about.${m.kind}`) : "", m.sample ? t("chip.sample") : "", t(m.selected ? "chip.removing" : "chip.keeping")].filter(Boolean).join(" "),
  };
}

function Proof({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <li>
      <Tip text={tip}>
        <span tabIndex={0} className="cursor-help">
          {children}
        </span>
      </Tip>
    </li>
  );
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
  const t = useT(TRIM);
  const text = useMarkText();
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
        <span>{doc.pages.length > 1 ? t("page.of", { n: index + 1, total: doc.pages.length }) : t("page.single", { n: index + 1 })}</span>
        {doc.kind === "pdf" && doc.pages.length > 1 && (
          <Tip text={t("page.send.tip")}>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={keep} onChange={(e) => onKeep(e.target.checked)} />
              {t("page.send")}
            </label>
          </Tip>
        )}
      </div>
      <div className="relative inline-block overflow-hidden rounded-md bg-white shadow ring-1 ring-ink/10" style={{ width: page.width * scale, height: page.height * scale }}>
        <canvas ref={canvas} className="block" role="img" aria-label={t("page.preview", { n: index + 1 })} />
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
                title={text.title(m)}
                aria-label={text.aria(m)}
                tabIndex={drawing ? -1 : undefined}
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
          {!keep && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-sm font-medium text-slate-300">{t("page.notSent")}</div>}
        </div>
      </div>
    </div>
  );
}

function TextView({ doc, marks, onToggle }: { doc: TrimDoc; marks: Mark[]; onToggle: (id: string) => void }) {
  const text = useMarkText();
  const source = doc.text ?? "";
  const parts: { text: string; mark?: Mark }[] = [];
  let cursor = 0;
  for (const m of [...marks].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) {
    if (m.start === undefined || m.end === undefined || m.start < cursor) continue;
    parts.push({ text: source.slice(cursor, m.start) }, { text: source.slice(m.start, m.end), mark: m });
    cursor = m.end;
  }
  parts.push({ text: source.slice(cursor) });
  return (
    <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-xs text-slate-900">
      {parts.map((p, i) =>
        p.mark ? (
          <button
            key={i}
            type="button"
            title={text.title(p.mark)}
            aria-label={text.aria(p.mark)}
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
  const t = useT(TRIM);
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
  return <canvas ref={canvas} className="rounded-md shadow ring-1 ring-ink/10" role="img" aria-label={t("proof.preview")} />;
}

export function TrimView({ doc: initial, need, onDone, onCancel }: { doc: TrimDoc; need?: string[]; onDone: (r: TrimResult) => void; onCancel: () => void }) {
  const locale = useLocale();
  const t = useT(TRIM);
  const tf = useT(FINDINGS);
  const fmt = useFormat();
  const text = useMarkText();
  const [doc, setDoc] = useState(initial);
  const [keep, setKeep] = useState<number[]>(() => initial.pages.map((p) => p.index));
  const [drawing, setDrawing] = useState(initial.marks.length === 0 && initial.kind !== "text");
  const [width, setWidth] = useState(480);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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
  const written = doc.language && doc.language !== locale ? tf("lang.detected", { language: languageName(doc.language, locale) }) : "";

  async function apply() {
    setBusy(true);
    setFailed(false);
    try {
      setResult(await applyTrim(doc, keep));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const v = result.verification;
    return (
      <div className="space-y-3">
        <p className="sr-only" role="status" aria-live="polite">
          {v.ok ? t("live.ok") : t("live.fail")}
        </p>
        <div className={cx("rounded-xl p-3 ring-2", v.ok ? "bg-saber/5 ring-saber/50" : "bg-sith/10 ring-sith/60")}>
          <p className={cx("text-base font-semibold", v.ok ? "text-saber" : "text-sith")}>{v.ok ? t("proof.ok") : t("proof.fail")}</p>
          <p className="mt-1 text-xs text-slate-300">{t("proof.rescanned")}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-200">
            {doc.kind === "pdf" && <Proof tip={t("proof.text.tip")}>{v.textChars === 0 ? t("proof.noText") : t("proof.textLeft", { count: v.textChars })}</Proof>}
            <Proof tip={t("proof.leaks.tip")}>{v.leaks === 0 ? t("proof.noLeaks") : t("proof.leaks", { count: v.leaks })}</Proof>
            {v.boxesChecked > 0 && (
              <Proof tip={t("proof.boxes.tip")}>{t(v.boxesOpaque === v.boxesChecked ? "proof.boxesOk" : "proof.boxesBad", { opaque: v.boxesOpaque, checked: v.boxesChecked })}</Proof>
            )}
            {doc.hasMetadata && <Proof tip={t("proof.meta.tip")}>{v.metadataClean ? t("proof.metaOk") : t("proof.metaBad")}</Proof>}
            <li>{t("proof.stats", { count: v.pages, seconds: fmt.fixed(v.ms / 1000, 1) })}</li>
          </ul>
          <p className="mt-2 text-xs text-slate-400">{resultLine(result, locale)}</p>
        </div>
        <div className="flex items-start gap-3">
          <OutputPreview file={result.file} />
          <p className="text-xs text-slate-400">{fill(t("proof.sealed"), "file", <span className="font-mono text-slate-200">{result.file.name}</span>)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Tip text={t("proof.use.tip")}>
            <button type="button" disabled={!v.ok} onClick={() => onDone(result)} className="rounded-lg bg-saber/90 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-saber disabled:opacity-50">
              {t("proof.use")}
            </button>
          </Tip>
          <Tip text={t("proof.adjust.tip")}>
            <button type="button" onClick={() => setResult(null)} className="rounded-lg bg-ink/5 px-3 py-1.5 text-sm text-slate-200 ring-1 ring-ink/10 hover:bg-ink/10">
              {t("proof.adjust")}
            </button>
          </Tip>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="sr-only" role="status" aria-live="polite">
        {busy ? t("live.busy") : ""}
      </p>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{t("editor.title")}</p>
          <p className="truncate text-xs text-slate-400">{doc.name}</p>
          {written && <p className="text-xs text-slate-500">{written}</p>}
        </div>
        <Tip text={t("editor.cancel.tip")}>
          <button type="button" onClick={onCancel} className="rounded px-2 text-slate-400 hover:bg-ink/10 hover:text-ink" aria-label={t("editor.cancel")}>
            ✕
          </button>
        </Tip>
      </div>

      {need && need.length > 0 && <p className="text-xs text-slate-300">{fill(t("editor.need"), "items", <span className="text-ink">{need.join(", ")}</span>)}</p>}
      {trimNotes(doc, locale).map((n) => (
        <p key={n} className="rounded-md bg-amber-400/10 px-2 py-1 text-xs text-amber-200 ring-1 ring-amber-300/20">
          {n}
        </p>
      ))}

      {found.length > 0 && (
        <div className="rounded-lg bg-slate-900/70 p-2 ring-1 ring-ink/10">
          <p className="mb-1 text-xs text-slate-400">
            {fill(t("editor.found"), "found", <span className="text-ink">{findingsLine(doc, locale) || t("editor.contacts", { count: found.length })}</span>)}
          </p>
          <div role="group" aria-label={t("editor.foundGroup")} className="flex max-h-32 flex-col gap-0.5 overflow-auto">
            {found.map((m) => (
              <Tip key={m.id} text={text.chip(m)}>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={m.selected} onChange={() => toggle(m.id)} aria-label={text.aria(m)} />
                  <span className={m.kind && SENSITIVE_KINDS.includes(m.kind) ? "text-sith" : "text-slate-300"}>{m.kind ? text.kindName(m.kind) : t("editor.box")}</span>
                  <span className="font-mono text-slate-400">{mask(m.value)}</span>
                  {m.sample && <span className="rounded bg-ink/10 px-1 text-[10px] text-slate-300">{t("editor.sample")}</span>}
                  {doc.pages.length > 1 && <span className="ml-auto text-slate-500">{t("editor.pageShort", { n: m.page + 1 })}</span>}
                </label>
              </Tip>
            ))}
          </div>
        </div>
      )}

      {doc.kind !== "text" && doc.kind !== "other" && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Tip text={drawing ? t("editor.drawOn.tip") : t("editor.drawOff.tip")}>
            <button
              type="button"
              onClick={() => setDrawing(!drawing)}
              className={cx("rounded-lg px-2.5 py-1 ring-1", drawing ? "bg-sith/20 text-ink ring-sith/60" : "bg-ink/5 text-slate-200 ring-ink/10 hover:bg-ink/10")}
            >
              <span aria-hidden="true">✎</span> {drawing ? t("editor.drawOn") : t("editor.drawOff")}
            </button>
          </Tip>
          {manual.length > 0 && (
            <Tip text={t("editor.clear.tip")}>
              <button type="button" onClick={() => setDoc((d) => ({ ...d, marks: d.marks.filter((m) => !m.manual) }))} className="text-slate-400 underline hover:text-ink">
                {t("editor.clear", { count: manual.length })}
              </button>
            </Tip>
          )}
          <span className="text-slate-500">{t("editor.help")}</span>
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

      {failed && (
        <p role="alert" className="text-xs text-sith">
          {t("editor.error")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Tip text={t("editor.apply.tip")}>
          <button
            type="button"
            onClick={apply}
            disabled={busy || doc.kind === "other" || keep.length === 0}
            aria-busy={busy}
            className="rounded-lg bg-saber/90 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-saber disabled:opacity-50"
          >
            {busy ? t("editor.busy") : selectedCount ? t("editor.applyHidden", { count: selectedCount }) : t("editor.apply")}
          </button>
        </Tip>
        <span className="text-[11px] text-slate-500">{t("editor.offline")}</span>
      </div>
    </div>
  );
}
