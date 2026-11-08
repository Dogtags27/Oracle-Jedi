import { useEffect, useState, type ReactNode } from "react";
import { Tip, TipIcon, useLocale, useT } from "@oj/core/i18n/react";
import { send } from "@/lib/messages";
import {
  ALLOW_KEY,
  CATEGORIES,
  SETTINGS_KEY,
  STATE_KEY,
  categoryLabel,
  loadAllow,
  loadSettings,
  loadState,
  mergeSettings,
  surfaceLabel,
  type AllowLists,
  type SheatheSettings,
  type SheatheState,
  type SiteId,
} from "@/lib/sheathe";
import { SHEATHE_PANEL } from "@/locales/sheathe-panel";
import { Button, Section, cx, rich } from "./ui";

const SITES: { id: SiteId; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp Web" },
  { id: "gmail", label: "Gmail" },
];

type Note = "page.done" | "page.needClick";

function Toggle({ checked, onChange, label, hint, tip }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; tip?: string }) {
  const t = useT(SHEATHE_PANEL);
  return (
    <div className="flex items-start gap-1.5">
      <label className="flex min-w-0 items-start gap-2 py-1 text-xs">
        <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>
          <span className="text-slate-200">{label}</span>
          {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
        </span>
      </label>
      {tip && <TipIcon text={tip} label={`${t("more")}: ${label}`} className="mt-1.5 shrink-0" />}
    </div>
  );
}

function Key({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <Tip text={tip}>
      <kbd tabIndex={0} className="font-mono">
        {children}
      </kbd>
    </Tip>
  );
}

export function SheathePanel() {
  const t = useT(SHEATHE_PANEL);
  const locale = useLocale();
  const [state, setState] = useState<SheatheState | null>(null);
  const [settings, setSettings] = useState<SheatheSettings | null>(null);
  const [allow, setAllow] = useState<AllowLists>({});
  const [note, setNote] = useState<Note | null>(null);

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
  const describe = state.mode === "sharing" ? t("state.sharing", { surface: surfaceLabel(state.surface ?? "unknown", locale) }) : t(`state.${state.mode}`);

  return (
    <div className="space-y-3">
      <Section className={on ? (state.mode === "panic" ? "ring-sith/60" : "ring-saber/50") : ""}>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true" className={cx("h-2.5 w-2.5 shrink-0 rounded-full", on ? (state.mode === "panic" ? "bg-sith" : "bg-saber") : "bg-slate-600")} />
          <p className="text-sm font-semibold">{describe}</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t("intro")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {state.mode === "manual" || state.mode === "panic" ? (
            <Tip text={t("turnOff.tip")}>
              <Button variant="ghost" onClick={() => send({ type: "sheathe:set", mode: "off" })}>
                {t("turnOff")}
              </Button>
            </Tip>
          ) : (
            <Tip text={t("now.tip")}>
              <Button variant="saber" onClick={() => send({ type: "sheathe:set", mode: "manual" })}>
                {t("now")}
              </Button>
            </Tip>
          )}
          <Tip text={t("panic.tip")}>
            <Button variant="danger" onClick={() => send({ type: "sheathe:set", mode: "panic" })}>
              {t("panic")}
            </Button>
          </Tip>
          <Tip text={t("page.tip")}>
            <Button
              variant="ghost"
              onClick={() =>
                send({ type: "sheathe:inject" })
                  .then(() => setNote("page.done"))
                  .catch(() => setNote("page.needClick"))
              }
            >
              {t("page")}
            </Button>
          </Tip>
        </div>
        <div aria-live="polite">{note && <p className="mt-1 text-[11px] text-amber-200">{t(note)}</p>}</div>
        <p className="mt-2 text-[11px] text-slate-500">
          {rich(t("shortcuts"), {
            toggle: <Key tip={t("shortcut.toggle.tip")}>Ctrl+Shift+9</Key>,
            panic: <Key tip={t("shortcut.panic.tip")}>Ctrl+Shift+0</Key>,
            page: <Key tip={t("shortcut.page.tip")}>Alt+Shift+S</Key>,
          })}
        </p>
      </Section>

      <Section title={t("when.title")}>
        <Toggle checked={settings.enabled} onChange={(v) => save({ enabled: v })} label={t("when.enabled")} tip={t("when.enabled.tip")} />
        <Toggle checked={settings.auto} onChange={(v) => save({ auto: v })} label={t("when.auto")} hint={t("when.auto.hint")} />
        <Toggle checked={settings.inCalls} onChange={(v) => save({ inCalls: v })} label={t("when.calls")} hint={t("when.calls.hint")} />
        <Toggle
          checked={settings.privateView}
          onChange={(v) => save({ privateView: v })}
          label={t("when.private")}
          hint={t("when.private.hint")}
          tip={t("when.private.tip")}
        />
      </Section>

      <Section title={t("what.title")}>
        {CATEGORIES.map((c) => (
          <Toggle key={c.id} checked={settings.categories[c.id]} onChange={(v) => save({ categories: { ...settings.categories, [c.id]: v } })} label={categoryLabel(c.id, locale)} />
        ))}
        <label className="mt-2 block text-xs text-slate-300">
          {t("strength", { px: settings.strength })}
          <input type="range" min={6} max={30} value={settings.strength} onChange={(e) => save({ strength: Number(e.target.value) })} className="mt-1 w-full" />
        </label>
        <label className="mt-2 block text-xs text-slate-300">
          {t("lastN", { count: settings.lastN })}
          <input type="range" min={0} max={5} value={settings.lastN} onChange={(e) => save({ lastN: Number(e.target.value) })} className="mt-1 w-full" />
        </label>
      </Section>

      <Section title={t("where.title")}>
        {SITES.map((s) => (
          <Toggle key={s.id} checked={settings.sites[s.id]} onChange={(v) => save({ sites: { ...settings.sites, [s.id]: v } })} label={s.label} />
        ))}
        <p className="mt-1 text-[11px] text-slate-500">{t("where.other")}</p>
      </Section>

      <Section
        title={t("revealed.title")}
        right={
          lists.length > 0 && (
            <Tip text={t("revealed.hideAll.tip")}>
              <button className="text-[11px] font-medium text-neel-700 hover:underline" onClick={() => browser.storage.local.set({ [ALLOW_KEY]: {} })}>
                {t("revealed.hideAll")}
              </button>
            </Tip>
          )
        }
      >
        {lists.length === 0 && <p className="text-[11px] text-slate-500">{t("revealed.empty")}</p>}
        {lists.map(([meeting, items]) => (
          <div key={meeting} className="mt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-mono text-[10px] text-slate-500">{meeting === "manual" ? t("revealed.manual") : meeting}</p>
              <button className="shrink-0 text-[11px] text-slate-500 hover:text-ink" onClick={() => hideMeeting(meeting)}>
                {t("revealed.hideThese")}
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {items.map((i) => (
                <Tip key={i} text={t("revealed.blurAgain", { item: i })}>
                  <button
                    aria-label={t("revealed.blurAgain", { item: i })}
                    onClick={() => hideOne(meeting, i)}
                    className="inline-flex items-center gap-1 rounded-full border border-neem-600/30 bg-neem-50 px-2 py-0.5 text-[11px] text-neem-700 hover:border-geru-600/40 hover:bg-geru-50 hover:text-geru-700"
                  >
                    {i}
                    <span aria-hidden>✕</span>
                  </button>
                </Tip>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}
