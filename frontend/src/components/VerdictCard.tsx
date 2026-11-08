import type { CheckResponse } from "@oj/core";
import { Badge } from "./ui";

const LOOK = {
  verified: { title: "Verified", tone: "green" as const, ring: "ring-saber/40", glow: "", icon: "✓" },
  mismatch: { title: "Doesn't match", tone: "red" as const, ring: "ring-sith/50", glow: "", icon: "✕" },
  unknown: { title: "Unknown", tone: "amber" as const, ring: "ring-amber-300/40", glow: "", icon: "?" },
};

export function VerdictCard({ result }: { result: CheckResponse }) {
  const look = LOOK[result.verdict];
  return (
    <section className={`rounded-2xl bg-slate-900/80 p-5 ring-2 ${look.ring} ${look.glow}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold ${result.verdict === "verified" ? "bg-saber text-slate-950" : result.verdict === "mismatch" ? "bg-sith text-ink" : "bg-amber-300 text-slate-950"}`}
        >
          {look.icon}
        </span>
        <div>
          <p className="text-xl font-semibold">{look.title}</p>
          <p className="text-sm text-slate-400">
            Who's asking: <span className="text-slate-200">{result.claimedOrg}</span>
            {result.officialDomain && (
              <>
                {" "}
                · official site <span className="font-mono text-jedi-400">{result.officialDomain}</span>
              </>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {result.officialVerifiedByDns && <Badge tone="green">DNS-verified office</Badge>}
          <Badge tone="slate">
            {result.source} · {(result.latencyMs / 1000).toFixed(1)}s
          </Badge>
        </div>
      </div>

      <p className="mt-4 text-slate-200">{result.explanation}</p>

      {result.signals.length > 0 && (
        <ul className="mt-4 space-y-1">
          {result.signals.map((s) => (
            <li key={s} className={`text-sm ${result.verdict === "verified" && s.includes("matches") ? "text-saber" : "text-amber-200"}`}>
              ⚑ {s}
            </li>
          ))}
        </ul>
      )}

      {(result.officialUploadUrl || result.officialPhone) && (
        <div className="mt-4 flex flex-wrap gap-3 rounded-xl bg-ink/[0.04] p-3 text-sm ring-1 ring-ink/10">
          <span className="text-slate-400">Use the official channel instead:</span>
          {result.officialPhone && <span className="font-mono text-slate-100">Tel. {result.officialPhone}</span>}
          {result.officialUploadUrl && (
            <a href={result.officialUploadUrl} target="_blank" rel="noreferrer noopener" className="truncate text-jedi-400 underline">
              Official portal ↗
            </a>
          )}
        </div>
      )}

      {result.evidence.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs uppercase tracking-wider text-slate-400">Evidence · quoted word-for-word from pages fetched live</p>
          <div className="space-y-2">
            {result.evidence.map((e, i) => (
              <a key={i} href={e.url} target="_blank" rel="noreferrer noopener" className="block rounded-xl bg-slate-950/70 p-3 ring-1 ring-ink/10 hover:ring-jedi-400/40">
                <p className="text-sm text-slate-200">"{e.quote}"</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="truncate font-mono text-jedi-400">{e.url.replace(/^https?:\/\//, "")}</span>
                  {e.verified && <Badge tone="green">verified in live fetch</Badge>}
                  {e.corroborated && <Badge tone="blue">corroborated by Exa</Badge>}
                  <Badge tone="slate">{e.source}</Badge>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      {result.providers.length > 0 && <p className="mt-4 text-xs text-slate-500">Providers: {result.providers.join(" → ")}</p>}
    </section>
  );
}
