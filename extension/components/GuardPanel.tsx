import { useEffect, useState } from "react";
import { send } from "@/lib/messages";
import { Badge, Button, Section, cx } from "./ui";

interface LogEntry {
  at: string;
  page: string;
  kind: string;
  label: string;
  dest: string;
  reason: string;
}

const KIND: Record<string, string> = {
  link: "Deceptive link",
  popup: "Hidden pop-up",
  redirect: "Sneaky redirect",
  form: "Form sent elsewhere",
  notification: "Notification trick",
};

export function GuardPanel() {
  const [enabled, setEnabled] = useState<string[] | null>(null);
  const [granted, setGranted] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [note, setNote] = useState("");

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
    setNote("");
    const ok = await browser.permissions.request({ origins: ["<all_urls>"] });
    if (!ok) return setNote("Chrome didn't grant access, so Click Guard stays off. You can still check one page at a time.");
    setGranted(true);
    await send({ type: "guard:enable" });
    setNote("On. Reload open tabs to protect them too.");
  }

  async function turnOff() {
    await send({ type: "guard:disable" });
    await browser.permissions.remove({ origins: ["<all_urls>"] }).catch(() => false);
    setGranted(false);
    setNote("Off, and the site access is handed back to Chrome.");
  }

  return (
    <div className="space-y-3">
      <Section className={everywhere ? "ring-saber/50" : ""}>
        <div className="flex items-center gap-2">
          <span className={cx("h-2.5 w-2.5 rounded-full", everywhere ? "bg-saber" : "bg-slate-600")} />
          <p className="text-sm font-semibold">Click Guard {everywhere ? "is on for every site" : "is off"}</p>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Catches buttons that aren't what they say: a "Close" or "No thanks" that opens another site, hidden pop-ups behind a real "Download", invisible layers over the page,
          sneaky redirects, fake download buttons and "click Allow" notification traps. As your pointer gets close to one, it outlines the real click area and shows where it really goes, before you click. Everything runs on this device: it never visits a link to find out.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {everywhere ? (
            <Button variant="ghost" onClick={turnOff}>
              Turn off
            </Button>
          ) : (
            <Button variant="saber" onClick={turnOn}>
              Guard every site
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() =>
              send({ type: "guard:inject" })
                .then(() => setNote("Checking this page now. Look for the Click Guard pill in its corner."))
                .catch(() => setNote("Chrome needs your click on the page itself: right-click → \"Check this page for deceptive buttons\", or press Alt+Shift+G."))
            }
          >
            Check this page
          </Button>
        </div>
        {note && <p className="mt-1 text-[11px] text-amber-200">{note}</p>}
        <p className="mt-2 text-[11px] text-slate-500">
          "Guard every site" asks Chrome for access to all sites only when you switch it on, and hands it back when you switch it off. To check just one page, right-click it or press{" "}
          <span className="font-mono">Alt+Shift+G</span>.
        </p>
      </Section>

      <Section
        title={`Blocked recently · ${log.length}`}
        right={
          log.length > 0 && (
            <button className="text-[11px] text-slate-500 hover:text-ink" onClick={() => browser.storage.local.set({ "guard:log": [] })}>
              Clear
            </button>
          )
        }
      >
        {log.length === 0 && <p className="text-[11px] text-slate-500">Nothing blocked yet. This list stays on this device.</p>}
        <div className="space-y-1.5">
          {log.slice(0, 20).map((e, i) => (
            <div key={i} className="rounded-lg bg-ink/[0.03] px-2 py-1.5 ring-1 ring-ink/10">
              <div className="flex items-center gap-1.5 text-xs">
                <Badge tone="red">{KIND[e.kind] ?? e.kind}</Badge>
                <span className="truncate text-slate-400">{e.page}</span>
                {e.dest && (
                  <>
                    <span className="text-slate-600">→</span>
                    <span className="truncate font-mono text-ink">{e.dest}</span>
                  </>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-slate-300">{e.reason}</p>
              <p className="text-[10px] text-slate-600">{new Date(e.at).toLocaleTimeString()}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
