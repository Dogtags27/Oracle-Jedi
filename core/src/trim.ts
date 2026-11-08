import { GlobalWorkerOptions, Util, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument } from "pdf-lib";
import { SENSITIVE_KINDS, countKinds, detect, redactText } from "./detect";
import type { Finding, FindingKind, RedactionSummary } from "./types";
import { detectLanguage } from "./i18n/lang";
import type { Locale } from "./i18n";

export type TrimNote = "scan" | "pdfMetadata" | "photo" | "exif" | "unsupported";

export type TrimKind = "pdf" | "image" | "text" | "other";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mark {
  id: string;
  page: number;
  rects: Rect[];
  kind?: FindingKind;
  value?: string;
  start?: number;
  end?: number;
  sample?: boolean;
  manual?: boolean;
  selected: boolean;
}

export interface TrimPage {
  index: number;
  width: number;
  height: number;
}

export interface TrimDoc {
  id: string;
  kind: TrimKind;
  name: string;
  type: string;
  bytes: Uint8Array;
  pages: TrimPage[];
  marks: Mark[];
  text?: string;
  notes: string[];
  noteKeys: TrimNote[];
  language: Locale | null;
  hasMetadata: boolean;
}

export interface Verification {
  ok: boolean;
  pages: number;
  textChars: number;
  leaks: number;
  rescanFindings: number;
  boxesChecked: number;
  boxesOpaque: number;
  metadataClean: boolean;
  ms: number;
}

export interface TrimResult {
  file: File;
  summary: RedactionSummary;
  verification: Verification;
}

export const FLATTEN_SCALE = 2;

let warmed = false;
const pdfs = new Map<string, Promise<PDFDocumentProxy>>();

export function warmUp() {
  if (warmed || typeof Worker === "undefined") return;
  warmed = true;
  GlobalWorkerOptions.workerSrc = workerUrl;
  try {
    GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: "module" });
  } catch {
    GlobalWorkerOptions.workerPort = null;
  }
}

export function kindOf(name: string, type: string): TrimKind {
  if (type === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (/^image\/(png|jpe?g|webp)$/.test(type) || /\.(png|jpe?g|webp)$/i.test(name)) return "image";
  if (type.startsWith("text/") || /\.(txt|csv|tsv|md|json)$/i.test(name)) return "text";
  return "other";
}

const loadPdf = (bytes: Uint8Array) => {
  warmUp();
  return getDocument({ data: bytes.slice(), useSystemFonts: true, stopAtErrors: false }).promise;
};

const newId = () => Math.random().toString(36).slice(2, 10);

function hasExif(bytes: Uint8Array) {
  const head = bytes.subarray(0, Math.min(bytes.length, 128 * 1024));
  for (let i = 0; i < head.length - 6; i++) {
    if (head[i] === 0x45 && head[i + 1] === 0x78 && head[i + 2] === 0x69 && head[i + 3] === 0x66 && head[i + 4] === 0 && head[i + 5] === 0) return true;
  }
  return false;
}

async function personalMetadata(pdf: PDFDocumentProxy) {
  const meta = (await pdf.getMetadata().catch(() => null)) as { info?: Record<string, unknown>; metadata?: unknown } | null;
  const info = meta?.info ?? {};
  const personal = ["Author", "Title", "Subject", "Keywords"].some((k) => typeof info[k] === "string" && String(info[k]).trim());
  return personal || Boolean(meta?.metadata);
}

async function anyMetadata(pdf: PDFDocumentProxy) {
  const meta = (await pdf.getMetadata().catch(() => null)) as { info?: Record<string, unknown>; metadata?: unknown } | null;
  const info = meta?.info ?? {};
  return (await personalMetadata(pdf)) || ["Creator", "Producer", "CreationDate", "ModDate"].some((k) => typeof info[k] === "string" && String(info[k]).trim());
}

interface Span {
  start: number;
  end: number;
  x: number;
  top: number;
  width: number;
  height: number;
  str: string;
  family: string;
}

let measurer: CanvasRenderingContext2D | null | undefined;

function fraction(str: string, family: string, index: number) {
  if (index <= 0) return 0;
  if (index >= str.length) return 1;
  if (measurer === undefined) measurer = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!measurer) return index / str.length;
  measurer.font = `100px ${family || "sans-serif"}`;
  const total = measurer.measureText(str).width;
  return total > 0 ? measurer.measureText(str.slice(0, index)).width / total : index / str.length;
}

function layoutText(items: TextItem[], transform: number[], styles: Record<string, { fontFamily?: string }>) {
  let text = "";
  const spans: Span[] = [];
  let prev: { right: number; baseline: number; height: number } | null = null;
  for (const item of items) {
    const tx = Util.transform(transform, item.transform);
    const height = Math.hypot(tx[2]!, tx[3]!) || item.height || 10;
    const x = tx[4]!;
    const baseline = tx[5]!;
    const width = item.width * Math.hypot(transform[0]!, transform[1]!);
    if (prev && item.str) {
      const sameLine = Math.abs(baseline - prev.baseline) < height * 0.5;
      if (!sameLine && !text.endsWith("\n")) text += "\n";
      else if (sameLine && x - prev.right > height * 0.2 && !/\s$/.test(text)) text += " ";
    }
    if (item.str) {
      spans.push({ start: text.length, end: text.length + item.str.length, x, top: baseline - height * 0.88, width, height: height * 1.18, str: item.str, family: styles[item.fontName]?.fontFamily ?? "sans-serif" });
      text += item.str;
      prev = { right: x + width, baseline, height };
    }
    if (item.hasEOL && !text.endsWith("\n")) text += "\n";
  }
  return { text, spans };
}

function rectsFor(start: number, end: number, spans: Span[]): Rect[] {
  const rects: Rect[] = [];
  for (const s of spans) {
    const a = Math.max(start, s.start);
    const b = Math.min(end, s.end);
    if (b <= a) continue;
    const left = s.x + fraction(s.str, s.family, a - s.start) * s.width;
    const right = s.x + fraction(s.str, s.family, b - s.start) * s.width;
    const pad = Math.max(2, s.height * 0.12);
    rects.push({ x: left - pad, y: s.top - 1.5, w: right - left + pad * 2, h: s.height + 3 });
  }
  return rects;
}

const markFrom = (f: Finding, page: number, rects: Rect[]): Mark => ({
  id: newId(),
  page,
  rects,
  kind: f.kind,
  value: f.value,
  start: f.start,
  end: f.end,
  sample: f.sample,
  selected: SENSITIVE_KINDS.includes(f.kind),
});

export async function analyzeFile(name: string, type: string, bytes: Uint8Array): Promise<TrimDoc> {
  const kind = kindOf(name, type);
  const doc: TrimDoc = { id: newId(), kind, name, type: type || "application/octet-stream", bytes, pages: [], marks: [], notes: [], noteKeys: [], language: null, hasMetadata: false };
  const note = (key: TrimNote, text: string) => {
    doc.noteKeys.push(key);
    doc.notes.push(text);
  };
  if (kind === "pdf") {
    const loading = loadPdf(bytes);
    pdfs.set(doc.id, loading);
    const pdf = await loading;
    doc.hasMetadata = await anyMetadata(pdf);
    let textChars = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      doc.pages.push({ index: i - 1, width: vp.width, height: vp.height });
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is TextItem => "str" in it);
      const { text, spans } = layoutText(items, vp.transform, content.styles as Record<string, { fontFamily?: string }>);
      textChars += text.trim().length;
      if (!doc.language) doc.language = detectLanguage(text).lang;
      for (const f of detect(text, undefined, doc.language ?? undefined)) {
        const rects = rectsFor(f.start, f.end, spans);
        if (rects.length) doc.marks.push(markFrom(f, i - 1, rects));
      }
    }
    if (textChars === 0) note("scan", "This PDF looks like a scan (no text layer). Draw boxes over anything they don't need.");
    if (doc.hasMetadata) note("pdfMetadata", "Document properties (author, software, dates) will be removed.");
  } else if (kind === "image") {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: doc.type }));
    doc.pages.push({ index: 0, width: bitmap.width, height: bitmap.height });
    bitmap.close();
    doc.hasMetadata = hasExif(bytes);
    note("photo", "Photos have no readable text here. Draw boxes over anything they don't need.");
    if (doc.hasMetadata) note("exif", "Camera metadata (it can include GPS location) will be removed.");
  } else if (kind === "text") {
    doc.text = new TextDecoder().decode(bytes);
    doc.pages.push({ index: 0, width: 0, height: 0 });
    doc.language = detectLanguage(doc.text).lang;
    doc.marks = detect(doc.text, undefined, doc.language).map((f) => markFrom(f, 0, []));
  } else {
    note("unsupported", "Avaran can't look inside this file type, so it will be sealed exactly as it is.");
  }
  return doc;
}

const renders = new WeakMap<HTMLCanvasElement, number>();

export async function renderPage(doc: TrimDoc, index: number, canvas: HTMLCanvasElement, scale: number) {
  const page = doc.pages[index];
  if (!page) return;
  const ticket = (renders.get(canvas) ?? 0) + 1;
  renders.set(canvas, ticket);
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const off = document.createElement("canvas");
  off.width = Math.round(page.width * scale * ratio);
  off.height = Math.round(page.height * scale * ratio);
  await paint(doc, index, off, scale * ratio);
  if (renders.get(canvas) !== ticket) return;
  canvas.width = off.width;
  canvas.height = off.height;
  canvas.style.width = `${page.width * scale}px`;
  canvas.style.height = `${page.height * scale}px`;
  canvas.getContext("2d")!.drawImage(off, 0, 0);
  off.width = off.height = 0;
}

async function paint(doc: TrimDoc, index: number, canvas: HTMLCanvasElement, scale: number) {
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (doc.kind === "pdf") {
    const pdf = await (pdfs.get(doc.id) ?? loadPdf(doc.bytes));
    const page = await pdf.getPage(index + 1);
    await page.render({ canvas, viewport: page.getViewport({ scale }) }).promise;
  } else if (doc.kind === "image") {
    const bitmap = await createImageBitmap(new Blob([doc.bytes as BlobPart], { type: doc.type }));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode_failed"))), type, quality));

function blackOut(ctx: CanvasRenderingContext2D, rects: Rect[], scale: number) {
  ctx.fillStyle = "#000";
  for (const r of rects) ctx.fillRect(Math.floor(r.x * scale), Math.floor(r.y * scale), Math.ceil(r.w * scale) + 1, Math.ceil(r.h * scale) + 1);
}

const trimmedName = (name: string, ext?: string) => {
  const base = name.replace(/\.[^.]+$/, "");
  const original = name.match(/\.[^.]+$/)?.[0] ?? "";
  return `${base}-trimmed${ext ?? original}`;
};

function luminance(data: Uint8ClampedArray) {
  return 0.2126 * data[0]! + 0.7152 * data[1]! + 0.0722 * data[2]!;
}

function opaque(ctx: CanvasRenderingContext2D, r: Rect, scale: number) {
  const pts = [0.25, 0.5, 0.75];
  for (const fx of pts) {
    for (const fy of pts) {
      const px = ctx.getImageData(Math.floor((r.x + r.w * fx) * scale), Math.floor((r.y + r.h * fy) * scale), 1, 1).data;
      if (luminance(px) > 70) return false;
    }
  }
  return true;
}

const squash = (s: string) => s.toLowerCase().replace(/[\s\-–—.]/g, "");

export async function applyTrim(doc: TrimDoc, keepPages: number[]): Promise<TrimResult> {
  const started = performance.now();
  const selected = doc.marks.filter((m) => m.selected && keepPages.includes(m.page));
  const targets = selected.filter((m) => m.value && !m.manual).map((m) => m.value!);
  const removed = countKinds(selected.filter((m) => m.kind) as { kind: FindingKind }[]);
  const boxes = selected.reduce((n, m) => n + m.rects.length, 0);
  let file: File;

  if (doc.kind === "pdf") {
    const out = await PDFDocument.create();
    out.setProducer("Avaran Trim");
    out.setCreator("Avaran");
    for (const index of [...keepPages].sort((a, b) => a - b)) {
      const page = doc.pages[index]!;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(page.width * FLATTEN_SCALE);
      canvas.height = Math.round(page.height * FLATTEN_SCALE);
      await paint(doc, index, canvas, FLATTEN_SCALE);
      blackOut(canvas.getContext("2d")!, selected.filter((m) => m.page === index).flatMap((m) => m.rects), FLATTEN_SCALE);
      const jpg = await out.embedJpg(new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.9)).arrayBuffer()));
      out.addPage([page.width, page.height]).drawImage(jpg, { x: 0, y: 0, width: page.width, height: page.height });
      canvas.width = canvas.height = 0;
    }
    file = new File([(await out.save()) as BlobPart], trimmedName(doc.name, ".pdf"), { type: "application/pdf" });
  } else if (doc.kind === "image") {
    const page = doc.pages[0]!;
    const canvas = document.createElement("canvas");
    canvas.width = page.width;
    canvas.height = page.height;
    await paint(doc, 0, canvas, 1);
    blackOut(canvas.getContext("2d")!, selected.flatMap((m) => m.rects), 1);
    const png = doc.type === "image/png";
    const blob = await toBlob(canvas, png ? "image/png" : "image/jpeg", 0.92);
    file = new File([blob], trimmedName(doc.name, png ? ".png" : ".jpg"), { type: blob.type });
  } else if (doc.kind === "text") {
    const redacted = redactText(doc.text ?? "", selected.filter((m) => m.start !== undefined) as { start: number; end: number }[]);
    file = new File([redacted], trimmedName(doc.name), { type: doc.type || "text/plain" });
  } else {
    file = new File([doc.bytes as BlobPart], doc.name, { type: doc.type });
  }

  const verification = await verifyTrim(doc.kind, new Uint8Array(await file.arrayBuffer()), file.type, targets, selected, keepPages);
  verification.ms = Math.round(performance.now() - started);
  const summary: RedactionSummary = {
    removed,
    verified: verification.ok,
    boxes,
    pagesRemoved: doc.kind === "pdf" ? doc.pages.length - keepPages.length : 0,
    metadataRemoved: doc.hasMetadata && verification.metadataClean,
  };
  return { file, summary, verification };
}

export async function verifyTrim(
  kind: TrimKind,
  bytes: Uint8Array,
  type: string,
  targets: string[],
  marks: Pick<Mark, "page" | "rects" | "kind">[],
  keepPages: number[],
): Promise<Verification> {
  const v: Verification = { ok: false, pages: 0, textChars: 0, leaks: 0, rescanFindings: 0, boxesChecked: 0, boxesOpaque: 0, metadataClean: true, ms: 0 };
  const kinds = [...new Set(marks.map((m) => m.kind).filter((k): k is FindingKind => Boolean(k)))];
  if (kind === "pdf") {
    const pdf = await loadPdf(bytes);
    v.pages = pdf.numPages;
    const order = [...keepPages].sort((a, b) => a - b);
    let all = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      all += content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      const vp = page.getViewport({ scale: 1 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      await page.render({ canvas, viewport: vp }).promise;
      for (const m of marks.filter((mk) => mk.page === order[i - 1])) {
        for (const r of m.rects) {
          v.boxesChecked++;
          if (opaque(ctx, r, 1)) v.boxesOpaque++;
        }
      }
      canvas.width = canvas.height = 0;
    }
    v.metadataClean = !(await personalMetadata(pdf));
    await pdf.loadingTask.destroy();
    v.textChars = all.replace(/\s/g, "").length;
    v.leaks = targets.filter((t) => squash(all).includes(squash(t))).length;
    v.rescanFindings = detect(all, kinds.length ? kinds : SENSITIVE_KINDS).length;
  } else if (kind === "image") {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    v.pages = 1;
    for (const m of marks) {
      for (const r of m.rects) {
        v.boxesChecked++;
        if (opaque(ctx, r, 1)) v.boxesOpaque++;
      }
    }
    v.metadataClean = !hasExif(bytes);
  } else if (kind === "text") {
    const text = new TextDecoder().decode(bytes);
    v.pages = 1;
    v.textChars = text.length;
    v.leaks = targets.filter((t) => text.includes(t)).length;
    v.rescanFindings = detect(text, kinds.length ? kinds : SENSITIVE_KINDS).filter((f) => targets.some((t) => squash(t) === squash(f.value))).length;
  }
  v.ok = v.leaks === 0 && v.rescanFindings === 0 && v.boxesOpaque === v.boxesChecked && v.metadataClean;
  return v;
}

export function releaseDoc(doc: TrimDoc) {
  const pending = pdfs.get(doc.id);
  pdfs.delete(doc.id);
  pending?.then((pdf) => pdf.loadingTask.destroy()).catch(() => {});
}

export const manualMark = (page: number, rect: Rect): Mark => ({ id: newId(), page, rects: [rect], manual: true, selected: true });
