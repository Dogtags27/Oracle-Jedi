import { useEffect, useState } from "react";
import type { LedgerEntry } from "@oj/core";
import { ledger } from "../lib/api";
import { bytes } from "../lib/format";
import { Card } from "./ui";

function where(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/(ho|rq)_[A-Za-z0-9_-]+/g, "$1_…").replace(/\/object\/upload\/sign\/.*/, "/object/upload/sign/…").replace(/\/object\/sign\/.*/, "/object/sign/…")}`;
  } catch {
    return url;
  }
}

export function LedgerPanel({ title = "Privacy Ledger · everything that left this device" }: { title?: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => ledger.subscribe(setEntries), []);
  return (
    <Card title={title} subtitle={`${entries.length} requests · documents only ever leave as ciphertext`}>
      <div className="max-h-72 space-y-1 overflow-auto font-mono text-xs">
        {entries.length === 0 && <p className="text-slate-500">Nothing has left this device yet.</p>}
        {entries.map((e, i) => (
          <button key={i} onClick={() => setOpen(open === i ? null : i)} className="block w-full rounded-md bg-ink/[0.03] px-2 py-1.5 text-left hover:bg-ink/[0.06]">
            <div className="flex items-center gap-2">
              <span className={e.method === "PUT" ? "text-saber" : e.method === "DELETE" ? "text-sith" : "text-jedi-400"}>{e.method}</span>
              <span className="truncate text-slate-300">{where(e.url)}</span>
              <span className="ml-auto shrink-0 text-slate-500">{bytes(e.bytes)}</span>
            </div>
            {open === i && e.preview && <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-slate-500">{e.preview}</pre>}
          </button>
        ))}
      </div>
    </Card>
  );
}
