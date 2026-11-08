import { MEETING_MATCHES } from "@/lib/sheathe";

type Box = [number, number, number, number];
type Track = MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } | null };
type Gen = MediaStreamTrack & { writable: WritableStream<VideoFrame> };
type Ctor<T> = new (init: Record<string, unknown>) => T;

const STALE_MS = 3000;
const PAD = 0.012;

export default defineContentScript({
  matches: MEETING_MATCHES,
  world: "MAIN",
  runAt: "document_start",
  allFrames: true,
  main() {
    const md = navigator.mediaDevices as (MediaDevices & { __ojWrapped?: boolean }) | undefined;
    if (!md || md.__ojWrapped) return;
    md.__ojWrapped = true;
    const post = (msg: Record<string, unknown>) => window.postMessage({ __oj_sheathe: 1, ...msg }, location.origin);
    let seq = 0;
    const nextId = () => `${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let privateView = false;
    const veils = new Map<string, { boxes: Box[] | null; at: number }>();

    window.addEventListener("message", (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data as { __oj_sheathe_cfg?: number; privateView?: boolean; __oj_sheathe_veil?: number; handle?: string; boxes?: Box[]; none?: boolean } | null;
      if (d?.__oj_sheathe_cfg === 1) privateView = d.privateView === true;
      if (d?.__oj_sheathe_veil === 1 && typeof d.handle === "string") {
        const boxes = d.none ? null : Array.isArray(d.boxes) ? d.boxes.slice(0, 40).filter((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite)) : [];
        veils.set(d.handle, { boxes, at: performance.now() });
      }
    });

    function watchEnd(stream: MediaStream, onEnd: () => void) {
      const tracks = stream.getTracks();
      let ended = false;
      const check = () => {
        if (!ended && tracks.every((t) => t.readyState === "ended")) {
          ended = true;
          onEnd();
        }
      };
      for (const t of tracks) {
        t.addEventListener("ended", check);
        const stop = t.stop.bind(t);
        t.stop = () => {
          stop();
          queueMicrotask(check);
        };
      }
    }

    function veilTrack(track: Track): MediaStreamTrack | null {
      const w = window as unknown as { MediaStreamTrackProcessor?: Ctor<{ readable: ReadableStream<VideoFrame> }>; MediaStreamTrackGenerator?: Ctor<Gen> };
      if (!w.MediaStreamTrackProcessor || !w.MediaStreamTrackGenerator || typeof OffscreenCanvas !== "function" || typeof VideoFrame !== "function") return null;
      let processor: { readable: ReadableStream<VideoFrame> };
      let out: Gen;
      try {
        processor = new w.MediaStreamTrackProcessor({ track });
        out = new w.MediaStreamTrackGenerator({ kind: "video" });
      } catch {
        return null;
      }
      const canvas = new OffscreenCanvas(2, 2);
      const ctx = canvas.getContext("2d")!;
      const small = new OffscreenCanvas(2, 2);
      const sctx = small.getContext("2d")!;
      const handle = () => (typeof track.getCaptureHandle === "function" ? (track.getCaptureHandle()?.handle ?? null) : null);

      const plan = (): Box[] | null => {
        const h = handle();
        if (!h) return null;
        const v = veils.get(h);
        if (!v) return [[0, 0, 1, 1]];
        if (v.boxes === null) return null;
        if (performance.now() - v.at > STALE_MS) return [[0, 0, 1, 1]];
        return v.boxes;
      };

      const cover = (fw: number, fh: number, b: Box, label: string) => {
        const x = Math.max(0, Math.floor((b[0] - PAD) * fw));
        const y = Math.max(0, Math.floor((b[1] - PAD) * fh));
        const bw = Math.min(fw - x, Math.ceil((b[2] + PAD * 2) * fw));
        const bh = Math.min(fh - y, Math.ceil((b[3] + PAD * 2) * fh));
        if (bw < 2 || bh < 2) return;
        const sw = Math.max(2, Math.round(bw / 28));
        const sh = Math.max(2, Math.round(bh / 28));
        if (small.width !== sw || small.height !== sh) {
          small.width = sw;
          small.height = sh;
        }
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(canvas, x, y, bw, bh, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(small, 0, 0, sw, sh, x, y, bw, bh);
        ctx.fillStyle = "rgba(246,242,234,0.55)";
        ctx.fillRect(x, y, bw, bh);
        if (bw > 160 && bh > 40) {
          const size = Math.max(12, Math.min(22, Math.round(fw / 70)));
          ctx.font = `600 ${size}px Georgia, serif`;
          ctx.fillStyle = "rgba(30,27,23,0.78)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x + bw / 2, y + bh / 2);
        }
      };

      const raw = new OffscreenCanvas(2, 2);
      const rctx = raw.getContext("2d")!;
      let hasRaw = false;
      let lastWrite = 0;
      let lastTs = 0;
      let alive = true;
      const writer = out.writable.getWriter();
      let chain: Promise<unknown> = Promise.resolve();
      const emit = () => {
        const fw = raw.width;
        const fh = raw.height;
        if (canvas.width !== fw || canvas.height !== fh) {
          canvas.width = fw;
          canvas.height = fh;
        }
        ctx.drawImage(raw, 0, 0);
        const boxes = plan() ?? [];
        const whole = boxes.length === 1 && boxes[0]![2] >= 1 && boxes[0]![3] >= 1;
        for (const b of boxes) cover(fw, fh, b, whole ? "Veiled by Avaran" : "Private · veiled by Avaran");
        lastTs = Math.max(lastTs + 1000, Math.round(performance.now() * 1000));
        const next = new VideoFrame(canvas, { timestamp: lastTs });
        lastWrite = performance.now();
        chain = chain.then(() => writer.write(next)).catch(() => next.close());
      };
      const reader = processor.readable.getReader();
      (async () => {
        while (alive) {
          const { value: frame, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
          if (done || !frame) break;
          const fw = frame.displayWidth;
          const fh = frame.displayHeight;
          if (raw.width !== fw || raw.height !== fh) {
            raw.width = fw;
            raw.height = fh;
          }
          rctx.drawImage(frame, 0, 0, fw, fh);
          frame.close();
          hasRaw = true;
          emit();
        }
      })();
      const refresh = setInterval(() => {
        if (!alive) return clearInterval(refresh);
        if (hasRaw && performance.now() - lastWrite > 350) emit();
      }, 400);

      const stopOut = out.stop.bind(out);
      out.stop = () => {
        alive = false;
        stopOut();
        track.stop();
      };
      track.addEventListener("ended", () => {
        alive = false;
        stopOut();
        out.dispatchEvent(new Event("ended"));
      });
      track.addEventListener("capturehandlechange", () => out.dispatchEvent(new Event("capturehandlechange")));
      Object.assign(out, {
        getSettings: () => track.getSettings(),
        getConstraints: () => track.getConstraints(),
        applyConstraints: (c?: MediaTrackConstraints) => track.applyConstraints(c),
        getCaptureHandle: () => (typeof track.getCaptureHandle === "function" ? track.getCaptureHandle() : null),
      });
      try {
        Object.defineProperty(out, "label", { get: () => track.label });
        out.contentHint = track.contentHint || "detail";
      } catch {
        return out;
      }
      return out;
    }

    const display = md.getDisplayMedia?.bind(md);
    if (display) {
      md.getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
        const id = nextId();
        post({ phase: "arming", id });
        let stream: MediaStream;
        try {
          stream = await display(constraints);
        } catch (e) {
          post({ phase: "cancel", id });
          throw e;
        }
        const track = stream.getVideoTracks()[0] as Track | undefined;
        const readHandle = () => (typeof track?.getCaptureHandle === "function" ? (track.getCaptureHandle()?.handle ?? null) : undefined);
        const surface = (track?.getSettings() as MediaTrackSettings & { displaySurface?: string })?.displaySurface ?? "unknown";
        let veiled: MediaStreamTrack | null = null;
        if (track && privateView && surface === "browser") veiled = veilTrack(track);
        post({ phase: "on", id, surface, handle: readHandle(), veil: Boolean(veiled) });
        track?.addEventListener("capturehandlechange", () => post({ phase: "handle", id, handle: readHandle() }));
        const result = veiled ? new MediaStream([veiled, ...stream.getAudioTracks()]) : stream;
        watchEnd(result, () => post({ phase: "off", id }));
        return result;
      };
    }

    const user = md.getUserMedia?.bind(md);
    if (user) {
      md.getUserMedia = async function (constraints?: MediaStreamConstraints) {
        const stream = await user(constraints);
        const id = nextId();
        post({ phase: "call-on", id });
        watchEnd(stream, () => post({ phase: "call-off", id }));
        return stream;
      };
    }
  },
});
