import { fromB64, generateOfficeKeys, openSealed, randomBytes, sealToOffice, toB64 } from "@oj/core";
import { analyzeFile, applyTrim, manualMark, warmUp, type Rect } from "@oj/core/trim";
import { getDocument } from "pdfjs-dist";

warmUp();

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

async function renderGray(bytes: Uint8Array, kind: "pdf" | "image", scale: number) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (kind === "pdf") {
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport: vp }).promise;
    await pdf.loadingTask.destroy();
  } else {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]));
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    ctx.drawImage(bitmap, 0, 0);
  }
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Float32Array(canvas.width * canvas.height);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.2126 * data[i * 4]! + 0.7152 * data[i * 4 + 1]! + 0.0722 * data[i * 4 + 2]!;
  return { gray, width: canvas.width, height: canvas.height };
}

async function trim(name: string, type: string, b64: string, maskB64?: string, rects?: Rect[]) {
  const doc = await analyzeFile(name, type, fromB64(b64));
  if (rects) doc.marks.push(...rects.map((r) => manualMark(0, r)));
  if (rects && rects.length === 0) doc.marks.forEach((m) => (m.selected = false));
  const found = doc.marks.filter((m) => m.selected).map((m) => ({ kind: m.kind ?? "box", value: m.value ?? "" }));
  const result = await applyTrim(doc, doc.pages.map((p) => p.index));
  const out = new Uint8Array(await result.file.arrayBuffer());
  let coverage: { ink: number; covered: number } | undefined;
  if (maskB64 && doc.kind !== "text") {
    const mask = await renderGray(fromB64(maskB64), doc.kind === "pdf" ? "pdf" : "image", 2);
    const output = await renderGray(out, doc.kind === "pdf" ? "pdf" : "image", doc.kind === "pdf" ? 2 : 1);
    let ink = 0;
    let covered = 0;
    const sx = output.width / mask.width;
    const sy = output.height / mask.height;
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        if (mask.gray[y * mask.width + x]! > 110) continue;
        ink++;
        const ox = Math.floor(x * sx);
        const oy = Math.floor(y * sy);
        let solid = true;
        for (let dy = -2; dy <= 2 && solid; dy++) {
          for (let dx = -2; dx <= 2 && solid; dx++) {
            const px = Math.min(output.width - 1, Math.max(0, ox + dx));
            const py = Math.min(output.height - 1, Math.max(0, oy + dy));
            if (output.gray[py * output.width + px]! >= 70) solid = false;
          }
        }
        if (solid) covered++;
      }
    }
    coverage = { ink, covered };
  }
  return { kind: doc.kind, found, verification: result.verification, summary: result.summary, outName: result.file.name, outB64: toB64(out), coverage };
}

async function bench(megabytes: number, runs = 3) {
  const keys = generateOfficeKeys("bench.test", "Bench Office");
  const data = new Uint8Array(megabytes * 1024 * 1024);
  for (let i = 0; i < data.length; i += 65536) data.set(randomBytes(Math.min(65536, data.length - i)), i);
  const seal: number[] = [];
  const open: number[] = [];
  let overhead = 0;
  for (let i = 0; i < runs; i++) {
    let t = performance.now();
    const sealed = await sealToOffice(data, { name: "bench.bin", type: "application/octet-stream", size: data.length }, keys.bundle);
    seal.push(performance.now() - t);
    overhead = sealed.ciphertext.length - data.length;
    t = performance.now();
    const opened = await openSealed(sealed, keys.secret);
    open.push(performance.now() - t);
    if (opened.data.length !== data.length) throw new Error("bench_roundtrip_failed");
  }
  return { megabytes, sealMs: Math.round(median(seal)), openMs: Math.round(median(open)), overheadBytes: overhead, userAgent: navigator.userAgent };
}

Object.assign(window, { ojLab: { trim, bench, ready: true } });
