import { useEffect, useState } from "react";
import type { LedgerEntry } from "@oj/core";
import { TipIcon, useFormat, useT } from "@oj/core/i18n/react";
import { ledger } from "../lib/api";
import { LEDGER } from "../locales/ledger";
import { Card } from "./ui";

function where(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/(ho|rq)_[A-Za-z0-9_-]+/g, "$1_…").replace(/\/object\/upload\/sign\/.*/, "/object/upload/sign/…").replace(/\/object\/sign\/.*/, "/object/sign/…")}`;
  } catch {
    return url;
  }
}

export function LedgerPanel({ title }: { title?: string }) {
  const t = useT(LEDGER);
  const fmt = useFormat();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => ledger.subscribe(setEntries), []);
  const preview = (e: LedgerEntry) => {
    if (e.preview === "[binary]") return t("binary");
    if (e.preview.startsWith("[ciphertext · ")) return t("ciphertext", { n: fmt.number(e.bytes) });
    return e.preview;
  };
  return (
    <Card
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          {title ?? t("title")}
          <TipIcon text={t("tip")} label={t("tip.label")} />
        </span>
      }
      subtitle={t("subtitle", { count: entries.reduce((n, e) => n + (e.count ?? 1), 0) })}
    >
      <div className="max-h-72 space-y-1 overflow-auto font-mono text-xs">
        {entries.length === 0 && <p className="text-slate-500">{t("empty")}</p>}
        {entries.map((e, i) => (
          <button
            key={i}
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={e.preview ? open === i : undefined}
            className="block w-full rounded-md bg-ink/[0.03] px-2 py-1.5 text-left hover:bg-ink/[0.06]"
          >
            <div className="flex items-center gap-2">
              <span className={e.method === "PUT" ? "text-saber" : e.method === "DELETE" ? "text-sith" : "text-jedi-400"}>{e.method}</span>
              <span className="truncate text-slate-300">{where(e.url)}</span>
              {(e.count ?? 1) > 1 && (
                <span className="shrink-0 rounded bg-ink/[0.06] px-1.5 text-[11px] text-slate-400" title={t("repeat", { count: e.count })}>
                  ×{e.count}
                </span>
              )}
              <span className="ml-auto shrink-0 text-slate-500">{fmt.bytes(e.bytes)}</span>
            </div>
            {open === i && e.preview && <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-500">{preview(e)}</pre>}
          </button>
        ))}
      </div>
    </Card>
  );
}
