import type { CheckResponse } from "@oj/core";
import type { Locale } from "@oj/core/i18n";
import { Tip, useFormat, useLocale, useT } from "@oj/core/i18n/react";
import { FINDINGS, checkExplanation, isGoodSignal, signalText } from "@oj/core/findings";
import { Badge } from "./ui";

const LOOK = {
  verified: { tone: "green" as const, ring: "ring-saber/40", icon: "✓" },
  mismatch: { tone: "red" as const, ring: "ring-sith/50", icon: "✕" },
  unknown: { tone: "amber" as const, ring: "ring-amber-300/40", icon: "?" },
};

export function VerdictCard({ result, locale }: { result: CheckResponse; locale?: Locale }) {
  const ui = useLocale();
  const L = locale ?? ui;
  const t = useT(FINDINGS, L);
  const fmt = useFormat(L);
  const look = LOOK[result.verdict];
  const title = t(`verdict.${result.verdict}`);
  const rows = result.facts
    ? result.facts.map((f) => ({ text: signalText(f, L), good: isGoodSignal(result, f) }))
    : result.signals.map((s) => ({ text: s, good: result.verdict === "verified" && s.includes("matches") }));
  const seen = new Set<string>();
  const signals = rows.filter((r) => !seen.has(r.text) && Boolean(seen.add(r.text)));
  return (
    <section lang={L} aria-label={title} className={`rounded-2xl bg-slate-900/80 p-5 ring-2 ${look.ring}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold ${result.verdict === "verified" ? "bg-saber text-slate-950" : result.verdict === "mismatch" ? "bg-sith text-ink" : "bg-amber-300 text-slate-950"}`}
        >
          {look.icon}
        </span>
        <div>
          <Tip text={t(`verdict.${result.verdict}.tip`)}>
            <p tabIndex={0} className="cursor-help text-xl font-semibold">
              {title}
            </p>
          </Tip>
          <p className="text-sm text-slate-400">
            {t("card.whoAsking.label")} <span className="text-slate-200">{result.claimedOrg}</span>
            {result.officialDomain && (
              <>
                {" "}
                · {t("card.officialSite")} <span className="font-mono text-jedi-400">{result.officialDomain}</span>
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {result.officialVerifiedByDns && (
            <Tip text={t("tip.dnsVerified")}>
              <span tabIndex={0}>
                <Badge tone="green">{t("card.dnsVerified")}</Badge>
              </span>
            </Tip>
          )}
          <Tip text={t("tip.source")}>
            <span tabIndex={0}>
              <Badge tone="slate">
                {t(`source.${result.source}`)} · {fmt.fixed(result.latencyMs / 1000, 1)}s
              </Badge>
            </span>
          </Tip>
        </div>
      </div>

      <p className="mt-4 text-slate-200">{checkExplanation(result, L)}</p>

      {signals.length > 0 && (
        <ul className="mt-4 space-y-1">
          {signals.map((s) => (
            <li key={s.text} className={`text-sm ${s.good ? "text-saber" : "text-amber-200"}`}>
              <span aria-hidden="true">⚑ </span>
              {s.text}
            </li>
          ))}
        </ul>
      )}

      {(result.officialUploadUrl || result.officialPhone) && (
        <div className="mt-4 flex flex-wrap gap-3 rounded-xl bg-ink/[0.04] p-3 text-sm ring-1 ring-ink/10">
          <Tip text={t("tip.officialChannel")}>
            <span className="text-slate-400">{t("card.useOfficialChannel")}</span>
          </Tip>
          {result.officialPhone && <span className="font-mono text-slate-100">{t("card.tel", { phone: result.officialPhone })}</span>}
          {result.officialUploadUrl && (
            <a href={result.officialUploadUrl} target="_blank" rel="noreferrer noopener" className="truncate text-jedi-400 underline">
              {t("card.officialPortal")}
            </a>
          )}
        </div>
      )}

      {result.evidence.length > 0 && (
        <div className="mt-5">
          <Tip text={t("tip.proof")}>
            <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">{t("card.evidence")}</p>
          </Tip>
          <div className="space-y-2">
            {result.evidence.map((e, i) => (
              <a key={i} href={e.url} target="_blank" rel="noreferrer noopener" className="block rounded-xl bg-slate-950/70 p-3 ring-1 ring-ink/10 hover:ring-jedi-400/40">
                <p className="text-sm text-slate-200">"{e.quote}"</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="truncate font-mono text-jedi-400">{e.url.replace(/^https?:\/\//, "")}</span>
                  {e.verified && <Badge tone="green">{t("card.verifiedLive")}</Badge>}
                  {e.corroborated && <Badge tone="blue">{t("card.corroborated")}</Badge>}
                  <Badge tone="slate">{t(`source.${e.source}`)}</Badge>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      {result.providers.length > 0 && <p className="mt-4 text-xs text-slate-500">{t("card.providers", { list: result.providers.join(" → ") })}</p>}
    </section>
  );
}
