import type { CheckResponse } from "@oj/core";
import { postJson } from "@/lib/api";
import { PANEL_INTENT, vaultKey, type Message, type PanelIntent, type VaultRecord } from "@/lib/messages";
import { MEETING_MATCHES, OFF, SOCIAL_MATCHES, STATE_KEY, loadSettings, loadState, meetingKeyFor, type SheatheState, type Surface } from "@/lib/sheathe";

const GMAIL = "https://mail.google.com/";
const SOCIAL_HOSTS = new Set(["web.whatsapp.com", "mail.google.com"]);
const SURFACES = new Set<Surface>(["monitor", "window", "browser", "unknown"]);

const calls = new Map<number, Set<string>>();
let grace: ReturnType<typeof setTimeout> | undefined;

const setState = (next: Omit<SheatheState, "at">) => browser.storage.local.set({ [STATE_KEY]: { ...next, at: Date.now() } });
const locked = (s: SheatheState) => s.mode === "manual" || s.mode === "panic";
const inCall = () => [...calls.values()].some((ids) => ids.size > 0);

function endShare(shareId: string | undefined, delay: number) {
  clearTimeout(grace);
  grace = setTimeout(async () => {
    const [s, settings] = await Promise.all([loadState(), loadSettings()]);
    if ((s.mode !== "arming" && s.mode !== "sharing") || s.shareId !== shareId) return;
    await setState(settings.inCalls && inCall() ? { mode: "call", meetingKey: s.meetingKey, meetingTabId: s.meetingTabId } : OFF);
  }, delay);
}

const HANDLES_KEY = "sheathe:handles";

async function socialHandles(): Promise<Record<string, number>> {
  return ((await browser.storage.session.get(HANDLES_KEY))[HANDLES_KEY] as Record<string, number> | undefined) ?? {};
}

async function rememberHandle(handle: string, tabId: number) {
  const all = await socialHandles();
  for (const [h, t] of Object.entries(all)) if (t === tabId) delete all[h];
  all[handle] = tabId;
  await browser.storage.session.set({ [HANDLES_KEY]: all });
}

async function tellVeil(meetingTabId: number, handle: string | null | undefined) {
  if (typeof handle !== "string") return;
  const all = await socialHandles();
  if (all[handle] !== undefined) {
    browser.tabs.sendMessage(all[handle], { type: "sheathe:resend" }).catch(() => {});
    return;
  }
  browser.tabs.sendMessage(meetingTabId, { type: "sheathe:veil", handle, none: true }).catch(() => {});
}

const validBoxes = (boxes: unknown) =>
  Array.isArray(boxes)
    ? (boxes
        .slice(0, 40)
        .filter((b) => Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && Number.isFinite(n) && n >= -1 && n <= 2)) as [number, number, number, number][])
    : [];

async function onSignal(sig: Extract<Message, { type: "sheathe:signal" }>, tabId: number, url: string | undefined) {
  const [state, settings] = await Promise.all([loadState(), loadSettings()]);
  const auto = settings.enabled && settings.auto;
  const handle = sig.hasHandle ? (sig.handle ?? null) : undefined;
  if (sig.phase === "on" || sig.phase === "handle") tellVeil(tabId, handle);
  switch (sig.phase) {
    case "arming":
      if (locked(state) || !auto) return;
      clearTimeout(grace);
      return setState({ mode: "arming", shareId: sig.id, meetingTabId: tabId, meetingKey: meetingKeyFor(url), since: Date.now() });
    case "on": {
      if (locked(state) || !auto) return;
      clearTimeout(grace);
      const surface = SURFACES.has(sig.surface as Surface) ? (sig.surface as Surface) : "unknown";
      return setState({
        mode: "sharing",
        surface,
        capturedHandle: handle,
        shareId: sig.id,
        meetingTabId: tabId,
        meetingKey: meetingKeyFor(url),
        since: state.shareId === sig.id && state.since ? state.since : Date.now(),
        veil: sig.veil === true,
      });
    }
    case "handle":
      if (state.shareId !== sig.id || state.mode !== "sharing") return;
      return setState({ ...state, capturedHandle: handle });
    case "cancel":
    case "off":
      if (locked(state) || state.shareId !== sig.id || state.meetingTabId !== tabId) return;
      return endShare(sig.id, sig.phase === "off" ? 3000 : 0);
    case "call-on": {
      const ids = calls.get(tabId) ?? new Set<string>();
      ids.add(sig.id);
      calls.set(tabId, ids);
      if (state.mode === "off" && settings.enabled && settings.inCalls) return setState({ mode: "call", meetingTabId: tabId, meetingKey: meetingKeyFor(url) });
      return;
    }
    case "call-off":
      calls.get(tabId)?.delete(sig.id);
      if (state.mode === "call" && !inCall()) return setState(OFF);
      return;
  }
}

async function toggle(mode: "manual" | "panic") {
  const state = await loadState();
  return setState(state.mode === mode ? OFF : { mode, meetingKey: "manual", since: Date.now() });
}

const GUARD_IDS = ["oj-guard-hook", "oj-guard"];
const GUARD_KEY = "guard:enabled";

async function enableGuard(matches: string[] = ["<all_urls>"]) {
  await browser.scripting.unregisterContentScripts({ ids: GUARD_IDS }).catch(() => {});
  await browser.scripting.registerContentScripts([
    { id: "oj-guard-hook", js: ["content-scripts/guard-hook.js"], matches, runAt: "document_start", world: "MAIN", allFrames: false, persistAcrossSessions: true },
    { id: "oj-guard", js: ["content-scripts/guard.js"], matches, runAt: "document_start", allFrames: false, persistAcrossSessions: true },
  ]);
  await browser.storage.local.set({ [GUARD_KEY]: matches });
  return true;
}

async function disableGuard() {
  await browser.scripting.unregisterContentScripts({ ids: GUARD_IDS }).catch(() => {});
  await browser.storage.local.set({ [GUARD_KEY]: null });
  return true;
}

async function injectGuard(tabId: number | undefined) {
  if (tabId === undefined) throw new Error("no_tab");
  await browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/guard-hook.js"], world: "MAIN", injectImmediately: true });
  await browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/guard.js"], injectImmediately: true });
  return true;
}

const fromExtensionPage = (sender: Browser.runtime.MessageSender) => Boolean(sender.url?.startsWith(browser.runtime.getURL("/")));

async function adoptOpenTabs() {
  const [social, meetings] = await Promise.all([browser.tabs.query({ url: SOCIAL_MATCHES }), browser.tabs.query({ url: MEETING_MATCHES })]);
  const tabs = (list: Browser.tabs.Tab[]) => list.map((t) => t.id).filter((id): id is number => id !== undefined);
  await Promise.all([
    ...tabs(social).map((tabId) => browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/sheathe.js"] }).catch(() => {})),
    ...tabs(meetings).flatMap((tabId) => [
      browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/share-hook.js"], world: "MAIN" }).catch(() => {}),
      browser.scripting.executeScript({ target: { tabId }, files: ["/content-scripts/share-bridge.js"] }).catch(() => {}),
    ]),
  ]);
}

async function injectAnySite(tabId: number | undefined) {
  if (tabId === undefined) throw new Error("no_tab");
  await browser.scripting.executeScript({ target: { tabId }, files: ["/sheathe-any.js"] });
  return true;
}

async function handle(message: Message, sender: Browser.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (message.type) {
    case "check": {
      const r = message.request;
      return postJson<CheckResponse>("/check", {
        claimedOrg: String(r.claimedOrg).slice(0, 120),
        senderDomain: String(r.senderDomain ?? "").slice(0, 253),
        senderEmail: r.senderEmail ? String(r.senderEmail).slice(0, 254) : undefined,
        linkDomains: (r.linkDomains ?? []).slice(0, 10).map(String),
        phones: (r.phones ?? []).slice(0, 5).map(String),
        locationHint: r.locationHint,
      });
    }
    case "vault:open": {
      if (tabId === undefined || !sender.url?.startsWith(GMAIL) || !/^[0-9a-f-]{36}$/.test(message.nonce)) throw new Error("forbidden");
      const record: VaultRecord = {
        recipients: (message.context.recipients ?? []).slice(0, 20).map(String),
        flag: message.context.flag,
        tabId,
        createdAt: Date.now(),
      };
      await browser.storage.session.set({ [vaultKey(message.nonce)]: record });
      return true;
    }
    case "panel:open": {
      if (tabId !== undefined) await browser.sidePanel.open({ tabId });
      const intent: PanelIntent = { tab: message.tab, text: message.text, at: Date.now() };
      await browser.storage.session.set({ [PANEL_INTENT]: intent });
      return true;
    }
    case "sheathe:signal":
      if (tabId === undefined) throw new Error("forbidden");
      await onSignal(message, tabId, sender.tab?.url ?? sender.url);
      return true;
    case "sheathe:set":
      if (message.mode === "off") clearTimeout(grace);
      await setState(message.mode === "off" ? OFF : { mode: message.mode, meetingKey: "manual", since: Date.now() });
      return true;
    case "sheathe:hello":
      if (tabId === undefined || !SOCIAL_HOSTS.has(new URL(sender.tab?.url ?? sender.url ?? "about:blank").hostname) || !/^[0-9a-f]{32}$/.test(message.handle)) throw new Error("forbidden");
      await rememberHandle(message.handle, tabId);
      return true;
    case "sheathe:boxes": {
      if (tabId === undefined || (await socialHandles())[message.handle] !== tabId) throw new Error("forbidden");
      const state = await loadState();
      if (state.mode !== "sharing" || state.meetingTabId === undefined) return false;
      await browser.tabs.sendMessage(state.meetingTabId, { type: "sheathe:veil", handle: message.handle, boxes: validBoxes(message.boxes) }).catch(() => {});
      return true;
    }
    case "sheathe:inject": {
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      return injectAnySite(tab?.id);
    }
    case "guard:enable":
      if (!fromExtensionPage(sender)) throw new Error("forbidden");
      return enableGuard(message.matches?.length ? message.matches.slice(0, 20).map(String) : undefined);
    case "guard:disable":
      if (!fromExtensionPage(sender)) throw new Error("forbidden");
      return disableGuard();
    case "guard:inject": {
      if (!fromExtensionPage(sender)) throw new Error("forbidden");
      const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      return injectGuard(tab?.id);
    }
    default:
      throw new Error("unknown_message");
  }
}

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

  const reset = () => browser.storage.local.set({ [STATE_KEY]: { ...OFF, at: Date.now() } });
  browser.runtime.onStartup.addListener(reset);

  browser.runtime.onInstalled.addListener(() => {
    reset();
    adoptOpenTabs().catch(() => {});
    browser.contextMenus.removeAll(() => {
      browser.contextMenus.create({ id: "oj-link", title: "Check this link before opening", contexts: ["link"] });
      browser.contextMenus.create({ id: "oj-check", title: "Check who's asking", contexts: ["selection"] });
      browser.contextMenus.create({ id: "oj-sheathe", title: "Sheathe this page (blur personal info)", contexts: ["page", "image", "link"] });
      browser.contextMenus.create({ id: "oj-guard", title: "Check this page for deceptive buttons", contexts: ["page", "image", "link"] });
      browser.contextMenus.create({ id: "oj-seal", title: "Seal a file with Avaran", contexts: ["page", "editable"] });
    });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "oj-sheathe") {
      injectAnySite(tab?.id).catch(() => {});
      return;
    }
    if (info.menuItemId === "oj-guard") {
      injectGuard(tab?.id).catch(() => {});
      return;
    }
    if (tab?.windowId !== undefined) browser.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    const intent: PanelIntent =
      info.menuItemId === "oj-link"
        ? { tab: "check", text: info.linkUrl, at: Date.now() }
        : info.menuItemId === "oj-check"
          ? { tab: "check", text: info.selectionText, at: Date.now() }
          : { tab: "seal", at: Date.now() };
    browser.storage.session.set({ [PANEL_INTENT]: intent });
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command === "sheathe-toggle") toggle("manual");
    else if (command === "sheathe-panic") toggle("panic");
    else if (command === "sheathe-tab") injectAnySite(tab?.id).catch(() => {});
    else if (command === "guard-page") injectGuard(tab?.id).catch(() => {});
  });

  browser.permissions.onRemoved.addListener((removed) => {
    if (removed.origins?.includes("<all_urls>")) disableGuard();
  });

  browser.tabs.onRemoved.addListener(async (tabId) => {
    calls.delete(tabId);
    const state = await loadState();
    if (state.meetingTabId === tabId && (state.mode === "arming" || state.mode === "sharing" || state.mode === "call")) setState(OFF);
  });

  browser.tabs.onUpdated.addListener(async (tabId, change) => {
    if (change.status !== "loading") return;
    const state = await loadState();
    if (state.meetingTabId !== tabId) return;
    calls.delete(tabId);
    if (state.mode === "arming" || state.mode === "sharing") endShare(state.shareId, 0);
    else if (state.mode === "call") setState(OFF);
  });

  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    handle(message, sender).then(
      (data) => sendResponse({ ok: true, data }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  });
});
