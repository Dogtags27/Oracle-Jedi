import { useEffect, useState } from "react";
import { send } from "@/lib/messages";
import {
  ALLOW_KEY,
  CATEGORIES,
  SETTINGS_KEY,
  STATE_KEY,
  SURFACE_LABEL,
  loadAllow,
  loadSettings,
  loadState,
  mergeSettings,
  type AllowLists,
  type SheatheSettings,
  type SheatheState,
  type SiteId,
} from "@/lib/sheathe";
import { Button, Section, cx } from "./ui";

const SITES: { id: SiteId; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp Web" },
  { id: "gmail", label: "Gmail" },
];

function describe(state: SheatheState) {
  switch (state.mode) {
    case "arming":
      return "Share picker open: chats sheathed";
    case "sharing":
      return `On: ${SURFACE_LABEL[state.surface ?? "unknown"]}`;
    case "call":
      return "On: you're in a call";
    case "manual":
      return "On: turned on by you";
    case "panic":
      return "Panic: everything hidden";
    default:
      return "Off: nothing is being shared";
  }
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 py-1 text-xs">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-slate-200">{label}</span>
        {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function SheathePanel() {
  const [state, setState] = useState<SheatheState | null>(null);
  const [settings, setSettings] = useState<SheatheSettings | null>(null);
  const [allow, setAllow] = useState<AllowLists>({});
  const [note, setNote] = useState("");

  useEffect(() => {
    loadState().then(setState);
    loadSettings().then(setSettings);
    loadAllow().then(setAllow);
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local") return;
      if (changes[STATE_KEY]) setState(changes[STATE_KEY].newValue as SheatheState);
      if (changes[SETTINGS_KEY]) setSettings(mergeSettings(changes[SETTINGS_KEY].newValue as Partial<SheatheSettings>));
      if (changes[ALLOW_KEY]) setAllow((changes[ALLOW_KEY].newValue as AllowLists) ?? {});
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  if (!state || !settings) return null;
  const save = (patch: Partial<SheatheSettings>) => browser.storage.local.set({ [SETTINGS_KEY]: { ...settings, ...patch } });
  const on = state.mode !== "off";
  const lists = Object.entries(allow).filter(([, v]) => v.length);
  const hideMeeting = (meeting: string) => {
    const next = { ...allow };
    delete next[meeting];
    browser.storage.local.set({ [ALLOW_KEY]: next });
  };
  const hideOne = (meeting: string, item: string) => browser.storage.local.set({ [ALLOW_KEY]: { ...allow, [meeting]: (allow[meeting] ?? []).filter((x) => x !== item) } });

  return (
    <div className="space-y-3">
      <Section className={on ? (state.mode === "panic" ? "ring-sith/60" : "ring-saber/50") : ""}>
        <div className="flex items-center gap-2">
          <span className={cx("h-2.5 w-2.5 rounded-full", on ? (state.mode === "panic" ? "bg-sith" : "bg-saber") : "bg-slate-600")} />
          <p className="text-sm font-semibold">{describe(state)}</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Sheathe blurs chats and inboxes when you share your screen, before the first frame goes out. It all runs on this device: 0 network requests.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {state.mode === "manual" || state.mode === "panic" ? (
            <Button variant="ghost" onClick={() => send({ type: "sheathe:set", mode: "off" })}>
              Turn off
            </Button>
          ) : (
            <Button variant="saber" onClick={() => send({ type: "sheathe:set", mode: "manual" })}>
              Sheathe now
            </Button>
          )}
          <Button variant="danger" onClick={() => send({ type: "sheathe:set", mode: "panic" })}>
            Panic
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              send({ type: "sheathe:inject" })
                .then(() => setNote("Sheathed the current page. Run it again to undo."))
                .catch(() => setNote("Chrome needs your click on the page itself: right-click → \"Sheathe this page\", or press Alt+Shift+S."))
            }
          >
            Sheathe current page
          </Button>
        </div>
        {note && <p className="mt-1 text-[11px] text-amber-200">{note}</p>}
        <p className="mt-2 text-[11px] text-slate-500">
          Shortcuts: <span className="font-mono">Ctrl+Shift+9</span> on/off and <span className="font-mono">Ctrl+Shift+0</span> panic, both working even while desktop Zoom or Teams has focus. <span className="font-mono">Alt+Shift+S</span> sheathes any page.
        </p>
      </Section>

      <Section title="When to sheathe">
        <Toggle checked={settings.enabled} onChange={(v) => save({ enabled: v })} label="Sheathe is on" />
        <Toggle
          checked={settings.auto}
          onChange={(v) => save({ auto: v })}
          label="Automatically when I share my screen"
          hint="Google Meet, Zoom, Teams, Webex, Jitsi, Whereby, Discord and Slack in the browser. Arms as soon as the share picker opens."
        />
        <Toggle checked={settings.inCalls} onChange={(v) => save({ inCalls: v })} label="Whenever I'm in a call" hint="Camera or microphone on in a meeting tab." />
        <Toggle
          checked={settings.privateView}
          onChange={(v) => save({ privateView: v })}
          label="Private view when I present a tab (beta)"
          hint="You keep seeing your chats; the meeting gets a veiled copy. Avaran edits the outgoing video on this device, before Meet sends it. Works when you present a single Chrome tab; whole screens and windows still blur on your side."
        />
      </Section>

      <Section title="What to blur">
        {CATEGORIES.map((c) => (
          <Toggle key={c.id} checked={settings.categories[c.id]} onChange={(v) => save({ categories: { ...settings.categories, [c.id]: v } })} label={c.label} />
        ))}
        <label className="mt-2 block text-xs text-slate-300">
          Strength: {settings.strength}px
          <input type="range" min={6} max={30} value={settings.strength} onChange={(e) => save({ strength: Number(e.target.value) })} className="mt-1 w-full" />
        </label>
        <label className="mt-2 block text-xs text-slate-300">
          Keep the last {settings.lastN} message{settings.lastN === 1 ? "" : "s"} of the open chat visible
          <input type="range" min={0} max={5} value={settings.lastN} onChange={(e) => save({ lastN: Number(e.target.value) })} className="mt-1 w-full" />
        </label>
      </Section>

      <Section title="Where">
        {SITES.map((s) => (
          <Toggle key={s.id} checked={settings.sites[s.id]} onChange={(v) => save({ sites: { ...settings.sites, [s.id]: v } })} label={s.label} />
        ))}
        <p className="mt-1 text-[11px] text-slate-500">Any other site: right-click → "Sheathe this page" blurs ID, card, account and phone numbers, emails, and profile pictures.</p>
      </Section>

      <Section
        title="Revealed in meetings"
        right={
          lists.length > 0 && (
            <button className="text-[11px] font-medium text-neel-700 hover:underline" onClick={() => browser.storage.local.set({ [ALLOW_KEY]: {} })}>
              Hide all again
            </button>
          )
        }
      >
        {lists.length === 0 && (
          <p className="text-[11px] text-slate-500">Everything is blurred. Use "Reveal this chat" on the pill during a share to show one chat; it stays on this device and only for that meeting.</p>
        )}
        {lists.map(([meeting, items]) => (
          <div key={meeting} className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] text-slate-500">{meeting === "manual" ? "Turned on by you" : meeting}</p>
              <button className="shrink-0 text-[11px] text-slate-500 hover:text-ink" onClick={() => hideMeeting(meeting)}>
                Hide these
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {items.map((i) => (
                <button
                  key={i}
                  title={`Blur "${i}" again`}
                  onClick={() => hideOne(meeting, i)}
                  className="inline-flex items-center gap-1 rounded-full border border-neem-600/30 bg-neem-50 px-2 py-0.5 text-[11px] text-neem-700 hover:border-geru-600/40 hover:bg-geru-50 hover:text-geru-700"
                >
                  {i}
                  <span aria-hidden>✕</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}
