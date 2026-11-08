import { useEffect, useState } from "react";
import type { CheckResponse } from "@oj/core";
import { safeHttpUrl } from "@/lib/api";
import { riskyLinks, type Scan } from "./scan";

type Status = "idle" | "checking" | "done" | "error";

const LOOK = {
  verified: { cls: "verified", icon: "✓", title: "Verified" },
  mismatch: { cls: "mismatch", icon: "✕", title: "Doesn't match" },
  unknown: { cls: "unknown", icon: "?", title: "Unknown" },
};

function Host({ host, domain }: { host: string; domain: string }) {
  const sub = host.endsWith(domain) ? host.slice(0, host.length - domain.length) : "";
  return (
    <span className="mono">
      <span className="dim">{sub}</span>
      <b>{domain || host}</b>
    </span>
  );
}

export function Card({
  scan,
  canCheck,
  autoCheck,
  runCheck,
  onResult,
  onLedger,
}: {
  scan: Scan;
  canCheck: boolean;
  autoCheck: boolean;
  runCheck: () => Promise<CheckResponse>;
  onResult: (r: CheckResponse) => void;
  onLedger: () => void;
}) {
  const [status, setStatus] = useState<Status>(autoCheck && canCheck ? "checking" : "idle");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [hidden, setHidden] = useState(false);
  const [proof, setProof] = useState(false);

  async function run() {
    setStatus("checking");
    try {
      const r = await runCheck();
      setResult(r);
      setStatus("done");
      setProof(r.verdict === "mismatch");
      onResult(r);
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (autoCheck && canCheck) run();
  }, []);

  if (hidden) return null;

  const x = scan.request;
  const links = riskyLinks(scan, result);
  const highRisk = links.some((l) => l.level === "high") || scan.attachments.some((a) => a.level === "high");
  const look = result ? LOOK[result.verdict] : null;
  const cls = status === "checking" ? "checking" : look ? look.cls : highRisk ? "mismatch" : "unknown";
  const icon = status === "checking" ? "…" : look ? look.icon : highRisk ? "!" : "?";
  const title =
    status === "checking"
      ? "Who's asking? Checking the open web…"
      : look
        ? look.title
        : status === "error"
          ? "Couldn't check right now: treat it as Unknown"
          : highRisk
            ? "Careful: this email has a trap"
            : "Who's asking?";
  const portal = safeHttpUrl(result?.officialUploadUrl);

  return (
    <div className="oj">
      <div className={`card ${cls}`}>
        <div className="head">
          <div className={`dot ${cls} ${status === "checking" ? "pulse" : ""}`}>{icon}</div>
          <div className="grow">
            <div className="title">{title}</div>
            <div className="sub">
              Claims to be <b>{x.claimedOrg || "?"}</b>
              {scan.senderEmail && (
                <>
                  {" "}
                  · sent from <span className="mono">{scan.senderEmail}</span>
                </>
              )}
              {result?.officialDomain && (
                <>
                  {" "}
                  · official site <span className="mono accent">{result.officialDomain}</span>
                </>
              )}
            </div>
          </div>
          <div className="brand">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <path d="M5 28V14.5a11 11 0 0 1 22 0V28" stroke="#2b3666" strokeWidth="2.6" />
              <path d="M10.5 28V16a5.5 5.5 0 0 1 11 0v12" stroke="#b04b32" strokeWidth="2.6" />
              <path d="M3 28h26" stroke="#2b3666" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
            Avaran
            <button className="x" onClick={() => setHidden(true)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>

        {(x.requestedItems.length > 0 || x.credentialAsks.length > 0 || x.pressureSignals.length > 0) && (
          <div className="pills">
            {x.requestedItems.length > 0 && <span className="lead">Asks for</span>}
            {x.requestedItems.map((i) => (
              <span key={i} className="pill red">
                {i}
              </span>
            ))}
            {x.credentialAsks.map((i) => (
              <span key={i} className="pill red">
                {i}
              </span>
            ))}
            {x.pressureSignals.map((p) => (
              <span key={p} className="pill amber">
                {p}
              </span>
            ))}
          </div>
        )}

        {result && <p className="expl">{result.explanation}</p>}
        {x.credentialAsks.length > 0 && result?.verdict !== "verified" && (
          <p className="expl warn">Real organizations never need your password or login code by email. Don't type them into a page you reached from this message.</p>
        )}

        {result && result.signals.length > 0 && (
          <ul className="signals">
            {result.signals.slice(0, 5).map((s) => (
              <li key={s} className={result.verdict === "verified" && /match/i.test(s) && !/doesn't|isn't|not /i.test(s) ? "good" : ""}>
                ⚑ {s}
              </li>
            ))}
          </ul>
        )}

        {(result?.officialPhone || portal) && (
          <div className="official">
            <span className="dim">{result?.verdict === "verified" ? "Official channel:" : "Use the official channel instead:"}</span>
            {result?.officialPhone && <span className="mono strong">Tel. {result.officialPhone}</span>}
            {portal && (
              <a href={portal} target="_blank" rel="noopener noreferrer">
                Official portal ↗
              </a>
            )}
          </div>
        )}

        {links.length > 0 && (
          <div className="row">
            <div className="label">Links in this email · guarded: you'll be asked before they open</div>
            {links.slice(0, 4).map((l) => (
              <div key={l.href} className={`link ${l.level}`}>
                <span className="lvl">{l.level === "high" ? "!" : "△"}</span>
                <div>
                  <Host host={l.host} domain={l.domain} />
                  <div className="why">{l.reasons.join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {scan.attachments.length > 0 && (
          <div className="row">
            <div className="label">Attachments</div>
            {scan.attachments.map((a) => (
              <div key={a.name} className={`link ${a.level}`}>
                <span className="lvl">!</span>
                <div>
                  <span className="mono">
                    <b>{a.name}</b>
                  </span>
                  <div className="why">{a.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {result && result.evidence.length > 0 && (
          <div className="row">
            <button className="link-btn" onClick={() => setProof(!proof)}>
              {proof ? "Hide" : "Show"} proof · {result.evidence.length} quote{result.evidence.length > 1 ? "s" : ""} fetched live from the official site
            </button>
            {proof && (
              <div className="evidence">
                {result.evidence.map((e, i) => {
                  const href = safeHttpUrl(e.url);
                  return (
                    <a key={i} href={href} target="_blank" rel="noopener noreferrer">
                      <span>"{e.quote}"</span>
                      <span className="src">
                        <span className="mono accent">{e.url.replace(/^https?:\/\//, "").slice(0, 70)}</span>
                        {e.verified && <span className="pill green">verified in live fetch</span>}
                        <span className="pill slate">{e.source}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="foot">
          {status === "idle" && canCheck && (
            <button className="btn primary" onClick={run}>
              Check who's asking
            </button>
          )}
          {status === "error" && canCheck && (
            <button className="btn" onClick={run}>
              Try again
            </button>
          )}
          <span>Read on this device. Only the claimed name, sender address, link domains and phone numbers are checked, never the email itself.</span>
          <button className="link-btn" onClick={onLedger}>
            What left this device?
          </button>
          {result && <span className="dim">{(result.latencyMs / 1000).toFixed(1)}s · {result.source}</span>}
        </div>
      </div>
    </div>
  );
}
