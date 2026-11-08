export type SheatheMode = "off" | "arming" | "sharing" | "call" | "manual" | "panic";
export type Surface = "monitor" | "window" | "browser" | "unknown";
export type Category = "avatars" | "names" | "previews" | "messages" | "media" | "input";
export type SiteId = "whatsapp" | "gmail";

export interface SheatheState {
  mode: SheatheMode;
  surface?: Surface;
  capturedHandle?: string | null;
  shareId?: string;
  meetingTabId?: number;
  meetingKey?: string;
  since?: number;
  veil?: boolean;
  at: number;
}

export interface SheatheSettings {
  enabled: boolean;
  auto: boolean;
  inCalls: boolean;
  strength: number;
  lastN: number;
  privateView: boolean;
  categories: Record<Category, boolean>;
  sites: Record<SiteId, boolean>;
}

export type AllowLists = Record<string, string[]>;

export const STATE_KEY = "sheathe:state";
export const SETTINGS_KEY = "sheathe:settings";
export const ALLOW_KEY = "sheathe:allow";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "avatars", label: "Profile pictures" },
  { id: "names", label: "Names and senders" },
  { id: "previews", label: "Chat and inbox previews" },
  { id: "messages", label: "Open conversation" },
  { id: "media", label: "Photos, videos, attachments" },
  { id: "input", label: "What you're typing" },
];

export const DEFAULT_SETTINGS: SheatheSettings = {
  enabled: true,
  auto: true,
  inCalls: false,
  strength: 12,
  lastN: 0,
  privateView: false,
  categories: { avatars: true, names: true, previews: true, messages: true, media: true, input: true },
  sites: { whatsapp: true, gmail: true },
};

export const OFF: SheatheState = { mode: "off", at: 0 };

export const MEETING_MATCHES = [
  "https://meet.google.com/*",
  "https://*.zoom.us/*",
  "https://teams.microsoft.com/*",
  "https://teams.live.com/*",
  "https://teams.cloud.microsoft/*",
  "https://*.webex.com/*",
  "https://meet.jit.si/*",
  "https://whereby.com/*",
  "https://discord.com/*",
  "https://app.slack.com/*",
];

export const SOCIAL_MATCHES = ["https://web.whatsapp.com/*", "https://mail.google.com/*"];

export const SURFACE_LABEL: Record<Surface, string> = {
  monitor: "sharing your entire screen",
  window: "sharing a window",
  browser: "sharing a tab",
  unknown: "sharing your screen",
};

export function mergeSettings(stored: Partial<SheatheSettings> | undefined): SheatheSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    categories: { ...DEFAULT_SETTINGS.categories, ...(stored?.categories ?? {}) },
    sites: { ...DEFAULT_SETTINGS.sites, ...(stored?.sites ?? {}) },
  };
}

export function shouldShield(state: SheatheState, settings: SheatheSettings, site: SiteId, myHandle: string | null): boolean {
  if (state.mode === "panic") return true;
  if (!settings.enabled || !settings.sites[site]) return false;
  switch (state.mode) {
    case "manual":
    case "arming":
    case "call":
      return true;
    case "sharing":
      return true;
    default:
      return false;
  }
}

export function onScreen(state: SheatheState, myHandle: string | null): "yes" | "no" | "maybe" {
  if (state.mode !== "sharing") return "maybe";
  if (state.surface === "monitor") return "maybe";
  if (state.surface === "browser" && myHandle && state.capturedHandle !== undefined) return state.capturedHandle === myHandle ? "yes" : "no";
  return "maybe";
}

export function privateHere(state: SheatheState, settings: SheatheSettings, myHandle: string | null) {
  return settings.privateView && state.mode === "sharing" && state.surface === "browser" && Boolean(state.veil) && onScreen(state, myHandle) === "yes";
}

export type Box = [number, number, number, number];

export const normName = (s: string | null | undefined) =>
  (s ?? "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "").replace(/\s+/g, " ").trim();

export const meetingKeyFor = (url: string | undefined) => {
  try {
    const u = new URL(url ?? "");
    return `${u.host}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return "manual";
  }
};

export const loadSettings = async () => mergeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<SheatheSettings> | undefined);
export const loadState = async () => ((await browser.storage.local.get(STATE_KEY))[STATE_KEY] as SheatheState | undefined) ?? OFF;
export const loadAllow = async () => ((await browser.storage.local.get(ALLOW_KEY))[ALLOW_KEY] as AllowLists | undefined) ?? {};
