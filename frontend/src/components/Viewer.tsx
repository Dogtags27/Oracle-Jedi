import { useEffect, useMemo } from "react";
import type { Meta } from "@oj/core";
import { bytes } from "../lib/format";
import { Badge, Button } from "./ui";

export function Viewer({ data, meta, onClose, receipt = true }: { data: Uint8Array; meta: Meta; onClose: () => void; receipt?: boolean }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: meta.type })), [data, meta.type]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const isImage = meta.type.startsWith("image/");
  const isPdf = meta.type === "application/pdf";
  const isText = meta.type.startsWith("text/");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-2xl bg-slate-900 ring-1 ring-ink/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-ink/10 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{meta.name}</p>
            <p className="text-xs text-slate-400">
              {meta.type} · {bytes(meta.size)} · decrypted locally in this tab
            </p>
          </div>
          {receipt && <Badge tone="green">Signed open receipt sent</Badge>}
          {meta.redactions && <Badge tone={meta.redactions.verified ? "blue" : "amber"}>{meta.redactions.verified ? "Trimmed by sender · verified" : "Trimmed by sender"}</Badge>}
          <div className="ml-auto flex gap-2">
            <a href={url} download={meta.name}>
              <Button variant="ghost">Download</Button>
            </a>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="min-h-[50vh] flex-1 overflow-auto bg-slate-950 p-3">
          {isImage && <img src={url} alt={meta.name} className="mx-auto max-h-[70vh]" />}
          {isPdf && <iframe src={url} title={meta.name} className="h-[70vh] w-full rounded-lg bg-white" />}
          {isText && <pre className="whitespace-pre-wrap text-sm text-slate-200">{new TextDecoder().decode(data)}</pre>}
          {!isImage && !isPdf && !isText && <p className="p-6 text-center text-slate-400">Preview not available. Use Download.</p>}
        </div>
      </div>
    </div>
  );
}
