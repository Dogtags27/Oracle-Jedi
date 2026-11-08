import type { TabMessage } from "@/lib/messages";
import { MEETING_MATCHES, SETTINGS_KEY, loadSettings, mergeSettings, type SheatheSettings } from "@/lib/sheathe";

const PHASES = new Set(["arming", "on", "handle", "cancel", "off", "call-on", "call-off"]);
const SURFACES = new Set(["monitor", "window", "browser", "unknown"]);

export default defineContentScript({
  matches: MEETING_MATCHES,
  runAt: "document_start",
  allFrames: true,
  main(ctx) {
    const cfg = (s: SheatheSettings) => window.postMessage({ __oj_sheathe_cfg: 1, privateView: s.enabled && s.privateView }, location.origin);
    loadSettings().then(cfg);
    const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && changes[SETTINGS_KEY]) cfg(mergeSettings(changes[SETTINGS_KEY].newValue as Partial<SheatheSettings>));
    };
    browser.storage.onChanged.addListener(onStorage);
    const onMessage = (message: TabMessage) => {
      if (message?.type !== "sheathe:veil" || typeof message.handle !== "string") return;
      window.postMessage({ __oj_sheathe_veil: 1, handle: message.handle, boxes: message.boxes, none: message.none === true }, location.origin);
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(onStorage);
      browser.runtime.onMessage.removeListener(onMessage);
    });

    ctx.addEventListener(window, "message", (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      const d = e.data as { __oj_sheathe?: number; phase?: string; id?: string; surface?: string; handle?: string | null; veil?: boolean } | null;
      if (!d || d.__oj_sheathe !== 1 || !PHASES.has(d.phase ?? "") || typeof d.id !== "string" || d.id.length > 64) return;
      const signal = {
        type: "sheathe:signal" as const,
        phase: d.phase,
        id: d.id,
        surface: SURFACES.has(d.surface ?? "") ? d.surface : undefined,
        handle: d.handle === null ? null : typeof d.handle === "string" ? d.handle.slice(0, 128) : undefined,
        hasHandle: d.handle === null || typeof d.handle === "string",
        veil: d.veil === true,
      };
      browser.runtime.sendMessage(signal).catch(() => {});
    });
  },
});
