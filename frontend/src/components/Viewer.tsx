import { useEffect, useMemo } from "react";
import { KIND_ORDER, type Meta } from "@oj/core";
import { describeKinds } from "@oj/core/findings";
import { Tip, useFormat, useLocale, useT } from "@oj/core/i18n/react";
import { VIEWER } from "../locales/viewer";
import { Badge, Button } from "./ui";

export function Viewer({ data, meta, onClose, receipt = true }: { data: Uint8Array; meta: Meta; onClose: () => void; receipt?: boolean }) {
  const t = useT(VIEWER);
  const fmt = useFormat();
  const locale = useLocale();
  const url = useMemo(() => URL.createObjectURL(new Blob([data as unknown as BlobPart], { type: meta.type })), [data, meta.type]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const isImage = meta.type.startsWith("image/");
  const isPdf = meta.type === "application/pdf";
  const isText = meta.type.startsWith("text/");
  const redactions = meta.redactions;
  const removed = redactions ? describeKinds(redactions.removed, [...KIND_ORDER], locale) : "";
  const trimTip = redactions
    ? [removed ? t("trimmed.what", { what: removed }) : t("trimmed.generic"), redactions.verified ? t("trimmed.checked") : t("trimmed.unchecked")].join(" ")
    : "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={meta.name}
        className="flex max-h-full w-full max-w-4xl flex-col rounded-2xl bg-slate-900 ring-1 ring-ink/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ink/10 px-5 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{meta.name}</p>
            <p className="text-xs text-slate-400">{t("meta", { type: meta.type, size: fmt.bytes(meta.size) })}</p>
          </div>
          {receipt && (
            <Tip text={t("receipt.tip")}>
              <span tabIndex={0} className="inline-flex rounded-full">
                <Badge tone="green">{t("receipt")}</Badge>
              </span>
            </Tip>
          )}
          {redactions && (
            <Tip text={trimTip}>
              <span tabIndex={0} className="inline-flex rounded-full">
                <Badge tone={redactions.verified ? "blue" : "amber"}>{redactions.verified ? t("trimmed.verified") : t("trimmed")}</Badge>
              </span>
            </Tip>
          )}
          <div className="ml-auto flex gap-2">
            <a href={url} download={meta.name}>
              <Button variant="ghost" tabIndex={-1}>
                {t("download")}
              </Button>
            </a>
            <Button variant="ghost" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
        </div>
        <div className="min-h-[50vh] flex-1 overflow-auto bg-slate-950 p-3">
          {isImage && <img src={url} alt={meta.name} className="mx-auto max-h-[70vh]" />}
          {isPdf && <iframe src={url} title={meta.name} className="h-[70vh] w-full rounded-lg bg-white" />}
          {isText && <pre className="whitespace-pre-wrap text-sm text-slate-200">{new TextDecoder().decode(data)}</pre>}
          {!isImage && !isPdf && !isText && <p className="p-6 text-center text-slate-400">{t("noPreview")}</p>}
        </div>
      </div>
    </div>
  );
}
