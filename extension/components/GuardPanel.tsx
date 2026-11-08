import { useEffect, useState } from "react";
import { clickText, type ClickMsg } from "@oj/core/findings";
import { Tip, useFormat, useLocale, useT } from "@oj/core/i18n/react";
import { send } from "@/lib/messages";
import { GUARD_PANEL } from "@/locales/guard-panel";
import { Badge, Button, Section, cx, rich } from "./ui";

interface LogEntry {
  at: string;
  page: string;
  kind: string;
  label: string;
  dest: string;
  reason: string;
  msg?: ClickMsg;
}

const KINDS = ["link", "popup", "redirect", "form", "notification"] as const;
type Kind = (typeof KINDS)[number];
const isKind = (k: string): k is Kind => (KINDS as readonly string[]).includes(k);

type Note = "note.denied" | "note.on" | "note.off" | "note.checking" | "note.needClick";

export function GuardPanel() {
  const t = useT(GUARD_PANEL);
  const locale = useLocale();
  const f = useFormat();
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [granted, setGranted] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    const load = async () => {
      const r = await browser.storage.local.get(["guard:enabled", "guard:log"]);
      setEnabled((r["guard:enabled"] as string[] | null) ?? null);
      setLog((r["guard:log"] as LogEntry[] | undefined) ?? []);
      setGranted(await browser.permissions.contains({ origins: ["<all_urls>"] }));
    };
    load();
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local") return;
      if (changes["guard:enabled"]) setEnabled((changes["guard:enabled"].newValue as string[] | null) ?? null);
      if (changes["guard:log"]) setLog((changes["guard:log"].newValue as LogEntry[]) ?? []);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const everywhere = Boolean(enabled?.includes("<all_urls>") && granted);

  async function turnOn() {
    setNote(null);
    const ok = await browser.permissions.request({ origins: ["<all_urls>"] });
    if (!ok) return setNote("note.denied");
    setGranted(true);
    await send({ type: "guard:enable" });
    setNote("note.on");
  }

  async function turnOff() {
    await send({ type: "guard:disable" });
    await browser.permissions.remove({ origins: ["<all_urls>"] }).catch(() => false);
    setGranted(false);
    setNote("note.off");
  }

  return (
    <div className="space-y-3">
      <Section className={everywhere ? "ring-saber/50" : ""}>
        <div className="flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true" className={cx("h-2.5 w-2.5 shrink-0 rounded-full", everywhere ? "bg-saber" : "bg-slate-600")} />
          <p className="text-sm font-semibold">{t(everywhere ? "status.on" : "status.off")}</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{t("intro")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {everywhere ? (
            <Tip text={t("turnOff.tip")}>
              <Button variant="ghost" onClick={turnOff}>
                {t("turnOff")}
              </Button>
            </Tip>
          ) : (
            <Tip text={t("everySite.tip")}>
              <Button variant="saber" onClick={turnOn}>
                {t("everySite")}
              </Button>
            </Tip>
          )}
          <Tip text={t("checkPage.tip")}>
            <Button
              variant="ghost"
              onClick={() =>
                send({ type: "guard:inject" })
                  .then(() => setNote("note.checking"))
                  .catch(() => setNote("note.needClick"))
              }
            >
              {t("checkPage")}
            </Button>
          </Tip>
        </div>
        <div aria-live="polite">{note && <p className="mt-1 text-[11px] text-amber-200">{t(note)}</p>}</div>
        <p className="mt-2 text-[11px] text-slate-500">
          {rich(t("foot"), {
            shortcut: (
              <Tip text={t("shortcut.tip")}>
                <kbd tabIndex={0} className="font-mono">
                  Alt+Shift+G
                </kbd>
              </Tip>
            ),
          })}
        </p>
      </Section>

      <Section
        title={t("blocked", { count: log.length })}
        right={
          log.length > 0 && (
            <Tip text={t("clear.tip")}>
              <button className="text-[11px] text-slate-500 hover:text-ink" onClick={() => browser.storage.local.set({ "guard:log": [] })}>
                {t("clear")}
              </button>
            </Tip>
          )
        }
      >
        {log.length === 0 && <p className="text-[11px] text-slate-500">{t("empty")}</p>}
        <div className="space-y-1.5">
          {log.slice(0, 20).map((e, i) => (
            <div key={i} className="rounded-lg bg-ink/[0.03] px-2 py-1.5 ring-1 ring-ink/10">
              <div className="flex items-center gap-1.5 text-xs">
                <Badge tone="red">{isKind(e.kind) ? t(`kind.${e.kind}`) : e.kind}</Badge>
                <span className="truncate text-slate-400">{e.page}</span>
                {e.dest && (
                  <>
                    <span className="text-slate-600" aria-hidden="true">
                      →
                    </span>
                    <span className="truncate font-mono text-ink">{e.dest}</span>
                  </>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-300">{e.msg ? clickText(e.msg, locale) : e.reason}</p>
              <p className="text-[10px] text-slate-600">{f.time(e.at, { timeStyle: "medium" })}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
