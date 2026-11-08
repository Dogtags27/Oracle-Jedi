import { ADAPTERS, compileCss, hiddenCount, veilBoxes, type Adapter } from "@/lib/sheathe-adapters";
import type { TabMessage } from "@/lib/messages";
import {
  ALLOW_KEY,
  OFF,
  SETTINGS_KEY,
  STATE_KEY,
  SURFACE_LABEL,
  loadAllow,
  loadSettings,
  loadState,
  mergeSettings,
  normName,
  onScreen,
  privateHere,
  shouldShield,
  type AllowLists,
  type SheatheSettings,
  type SheatheState,
} from "@/lib/sheathe";

const PILL_CSS = `
:host{all:initial}
.p{position:fixed;left:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:min(780px,calc(100vw - 32px));
font:500 13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e1b17;background:#fffdf8;border:1px solid #e2d9c9;border-left:4px solid #36437e;
border-radius:10px;padding:8px 10px 8px 12px;box-shadow:0 10px 30px rgba(30,27,23,.16)}
.p.panic{border-left-color:#973d27}
.dot{width:8px;height:8px;border-radius:50%;background:#36437e}
.panic .dot{background:#973d27}
b{color:#1e1b17;font-weight:600}
.dim{color:#776e62}
button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #cfc3ae;background:#fffdf8;color:#1e1b17;padding:5px 10px}
button:hover{background:#eee8dc}
button.go{background:#2b3666;color:#fffdf8;border-color:#222a4f}
button.go:hover{background:#222a4f}
.tip{flex-basis:100%;color:#6e4f14;font-size:12px}`;

function randomHandle() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export default defineContentScript({
  matches: ["https://web.whatsapp.com/*", "https://mail.google.com/*"],
  runAt: "document_start",
  async main(ctx) {
    const adapter: Adapter | undefined = ADAPTERS.find((a) => a.match(location.hostname));
    if (!adapter) return;
    const root = document.documentElement;
    root.setAttribute("data-oj-sheathe", "on");
    root.setAttribute("data-oj-layer", "full");

    let handle: string | null = null;
    try {
      const md = navigator.mediaDevices as MediaDevices & { setCaptureHandleConfig?: (c: unknown) => void };
      if (window.top === window && typeof md?.setCaptureHandleConfig === "function") {
        const candidate = randomHandle();
        md.setCaptureHandleConfig({ handle: candidate, exposeOrigin: false, permittedOrigins: ["*"] });
        handle = candidate;
      }
    } catch {
      handle = null;
    }

    const style = el("style", { id: "oj-sheathe-style" });
    root.append(style);

    let state: SheatheState = OFF;
    let settings: SheatheSettings = mergeSettings(undefined);
    let allow: AllowLists = {};
    let paused = false;
    let peekTimer = 0;
    let realTitle = document.title;
    let maskedTitle = "";
    let pill: { host: HTMLElement; render: () => void } | null = null;

    const privateMode = () => !paused && privateHere(state, settings, handle);
    const active = () => !paused && shouldShield(state, settings, adapter.id, handle) && !privateMode();
    let lastBoxes = "";
    let lastSent = 0;
    function sendBoxes(force = false) {
      if (!handle || state.mode !== "sharing" || !settings.privateView || !settings.enabled) return;
      const boxes = paused || root.hasAttribute("data-oj-peek") ? [] : veilBoxes(adapter!.holes());
      const key = JSON.stringify(boxes);
      const now = Date.now();
      if (!force && key === lastBoxes && now - lastSent < 700) return;
      lastBoxes = key;
      lastSent = now;
      browser.runtime.sendMessage({ type: "sheathe:boxes", handle, boxes }).catch(() => {});
    }
    const meetingKey = () => (state.mode === "manual" || state.mode === "panic" ? "manual" : (state.meetingKey ?? "manual"));
    let allowSet = new Set<string>();
    const allowed = () => allowSet;
    const syncAllowed = () => {
      allowSet = new Set((allow[meetingKey()] ?? []).map(normName));
    };

    function applyTitle() {
      if (active()) {
        if (!maskedTitle || document.title !== maskedTitle) realTitle = document.title;
        maskedTitle = adapter!.maskTitle(realTitle);
        if (document.title !== maskedTitle) document.title = maskedTitle;
      } else if (maskedTitle) {
        maskedTitle = "";
        if (realTitle && document.title !== realTitle) document.title = realTitle;
      }
    }

    function applyLayers() {
      let found = 0;
      for (const region of adapter!.regions) {
        const node = document.querySelector(region.selector);
        if (!node) continue;
        found++;
        const layer = node.querySelector(region.detail) ? "fine" : "region";
        if (node.getAttribute("data-oj-layer") !== layer) node.setAttribute("data-oj-layer", layer);
      }
      const layer = found ? "fine" : "full";
      if (root.getAttribute("data-oj-layer") !== layer) root.setAttribute("data-oj-layer", layer);
    }

    function apply() {
      syncAllowed();
      style.textContent = compileCss(adapter!, settings);
      const on = active();
      root.setAttribute("data-oj-sheathe", on ? "on" : "off");
      if (state.mode === "panic") root.setAttribute("data-oj-panic", "");
      else root.removeAttribute("data-oj-panic");
      applyLayers();
      adapter!.markReveals(allowed(), settings.lastN);
      applyTitle();
      pill?.render();
      sendBoxes(true);
    }

    function mountPill() {
      const host = el("oj-sheathe-pill" as "div");
      const shadow = host.attachShadow({ mode: "closed" });
      const box = el("div", { className: "p" });
      shadow.append(el("style", { textContent: PILL_CSS }), box);
      const render = () => {
        const on = active() || privateMode();
        if (!on && !paused) {
          host.remove();
          return;
        }
        if (!host.isConnected) root.append(host);
        box.className = state.mode === "panic" ? "p panic" : "p";
        box.replaceChildren();
        if (paused) {
          box.append(
            el("span", { className: "dot" }),
            el("span", {}, el("b", {}, "Sheathe paused"), el("span", { className: "dim" }, " · this tab is visible")),
            el("button", { className: "go", onclick: () => ((paused = false), apply()) }, "Resume"),
          );
          return;
        }
        const what = privateMode()
          ? "Private view: you see this tab, the meeting sees a veil"
          : state.mode === "panic"
            ? "Panic: everything hidden"
            : state.mode === "manual"
              ? "Sheathed by you"
              : state.mode === "arming"
                ? "Sheathed: share picker open"
                : state.mode === "call"
                  ? "Sheathed: you're in a call"
                  : `Sheathed: ${SURFACE_LABEL[state.surface ?? "unknown"]}`;
        const current = adapter!.current();
        const isAllowed = current ? allowed().has(current) : false;
        const where = onScreen(state, handle);
        box.append(
          el("span", { className: "dot" }),
          el(
            "span",
            {},
            el("b", {}, what),
            el(
              "span",
              { className: "dim" },
              privateMode()
                ? ""
                : where === "no"
                  ? " · this tab isn't in the share, veiled in case you switch"
                  : ` · ${hiddenCount(adapter!, settings)} items hidden`,
            ),
          ),
        );
        if (state.mode !== "panic") {
          if (current) {
            box.append(
              el(
                "button",
                {
                  className: isAllowed ? "" : "go",
                  title: isAllowed ? `Hide "${current}" again` : `Show "${current}" for the rest of this meeting`,
                  onclick: () => toggleAllow(current),
                },
                isAllowed ? `Hide this ${adapter!.item.label}` : `Reveal this ${adapter!.item.label}`,
              ),
            );
          }
          const revealed = allowed().size;
          if (revealed > (isAllowed ? 1 : 0)) {
            box.append(
              el(
                "button",
                { title: `Blur every ${adapter!.item.label} you revealed in this meeting`, onclick: hideAll },
                revealed === 1 ? `Hide the revealed ${adapter!.item.label}` : `Hide all ${revealed} revealed`,
              ),
            );
          }
          box.append(
            el("button", { title: "Show everything for 10 seconds", onclick: peek }, "Show 10 s"),
            el("button", { title: "Stop sheathing this tab until the share ends", onclick: () => ((paused = true), apply()) }, "Pause"),
          );
        }
        if (state.mode === "sharing" && state.surface === "monitor") {
          box.append(el("span", { className: "tip" }, "Tip: share a single tab instead. Blur can't cover your address bar, tab previews or other apps."));
        }
      };
      pill = { host, render };
    }

    function peek() {
      root.setAttribute("data-oj-peek", "");
      sendBoxes(true);
      clearTimeout(peekTimer);
      peekTimer = window.setTimeout(() => {
        root.removeAttribute("data-oj-peek");
        sendBoxes(true);
      }, 10_000);
    }

    async function hideAll() {
      const key = meetingKey();
      const next = { ...allow };
      delete next[key];
      allow = next;
      await browser.storage.local.set({ [ALLOW_KEY]: allow });
      apply();
    }

    async function toggleAllow(item: string) {
      const key = meetingKey();
      const list = new Set((allow[key] ?? []).map(normName));
      if (list.has(item)) list.delete(item);
      else list.add(item);
      allow = { ...allow, [key]: [...list] };
      await browser.storage.local.set({ [ALLOW_KEY]: allow });
      apply();
    }

    mountPill();
    [state, settings, allow] = await Promise.all([loadState(), loadSettings(), loadAllow()]);
    apply();

    const onStorage = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local") return;
      if (changes[STATE_KEY]) {
        const next = (changes[STATE_KEY].newValue as SheatheState | undefined) ?? OFF;
        if (next.mode === "off" || next.shareId !== state.shareId) paused = false;
        state = next;
      }
      if (changes[SETTINGS_KEY]) settings = mergeSettings(changes[SETTINGS_KEY].newValue as Partial<SheatheSettings>);
      if (changes[ALLOW_KEY]) allow = (changes[ALLOW_KEY].newValue as AllowLists | undefined) ?? {};
      if (changes[STATE_KEY] || changes[SETTINGS_KEY] || changes[ALLOW_KEY]) apply();
    };
    browser.storage.onChanged.addListener(onStorage);

    let timer = 0;
    let lastPill = 0;
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.target.nodeName === "TITLE" || r.target.parentNode?.nodeName === "TITLE" || r.target.nodeName === "HEAD")) {
        if (document.title !== maskedTitle) realTitle = document.title;
        applyTitle();
      }
      applyLayers();
      if (allowSet.size || settings.lastN) adapter.enforce(allowSet);
      sendBoxes();
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        adapter.markReveals(allowed(), settings.lastN);
        const now = Date.now();
        if (active() && now - lastPill > 500) {
          lastPill = now;
          pill?.render();
        }
      }, 80);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["role", "aria-selected", "title"] });
    const ticker = window.setInterval(() => active() && pill?.render(), 2000);
    const heartbeat = window.setInterval(() => sendBoxes(true), 700);
    const onResize = () => sendBoxes(true);
    window.addEventListener("resize", onResize);
    const onMessage = (message: TabMessage) => {
      if (message?.type === "sheathe:resend") sendBoxes(true);
    };
    browser.runtime.onMessage.addListener(onMessage);
    if (handle) browser.runtime.sendMessage({ type: "sheathe:hello", handle }).catch(() => {});

    ctx.onInvalidated(() => {
      browser.storage.onChanged.removeListener(onStorage);
      observer.disconnect();
      clearInterval(ticker);
      clearInterval(heartbeat);
      window.removeEventListener("resize", onResize);
      browser.runtime.onMessage.removeListener(onMessage);
      style.remove();
      pill?.host.remove();
      root.removeAttribute("data-oj-sheathe");
      root.removeAttribute("data-oj-layer");
    });
  },
});
