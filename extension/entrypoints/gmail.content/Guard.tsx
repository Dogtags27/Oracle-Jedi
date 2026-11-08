import { useEffect, useRef, useState } from "react";
import type { LinkCheck } from "@oj/core";

const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export function Guard({
  check,
  officialDomain,
  officialName,
  onClose,
}: {
  check: LinkCheck;
  officialDomain?: string;
  officialName?: string;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const stay = useRef<HTMLButtonElement>(null);
  useEffect(() => stay.current?.focus(), []);
  const high = check.level === "high";
  const canOpen = Boolean(check.host) && !check.risks.includes("script");
  const sub = check.host.endsWith(check.domain) ? check.host.slice(0, check.host.length - check.domain.length) : "";
  let path = "";
  try {
    const u = new URL(check.href);
    path = `${u.pathname}${u.search}`.slice(0, 80);
  } catch {
    path = "";
  }

  return (
    <div className="oj backdrop" onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={`modal ${high ? "high" : "medium"}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="head">
          <div className={`dot ${high ? "mismatch" : "unknown"}`}>{high ? "✕" : "!"}</div>
          <div className="title">{high ? "Stop. This link isn't what it seems." : "Check before you open this link."}</div>
        </div>

        {check.host ? (
          <div className="row">
            <div className="label">It really goes to</div>
            <div className="dest mono">
              <span className="dim">{sub}</span>
              <b>{check.domain || check.host}</b>
              <span className="dim">{path}</span>
            </div>
            {check.shownDomain && check.shownDomain !== check.domain && (
              <div className="sub">
                The email shows <span className="mono strong">{check.shownDomain}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="row dest mono">{check.href.slice(0, 80)}</div>
        )}

        <ul className="signals">
          {check.reasons.map((r) => (
            <li key={r}>⚑ {r}</li>
          ))}
        </ul>

        {officialDomain && (
          <div className="official">
            <span className="dim">{officialName ?? "The sender"}'s official site:</span>
            <span className="mono accent">{officialDomain}</span>
          </div>
        )}

        <div className="actions">
          <button ref={stay} className="btn primary" onClick={onClose}>
            Don't open it
          </button>
          {officialDomain && (
            <button
              className="btn"
              onClick={() => {
                open(`https://${officialDomain}`);
                onClose();
              }}
            >
              Go to the official site instead
            </button>
          )}
          {canOpen && (
            <button
              className={`btn ${confirming ? "danger" : "quiet"}`}
              onClick={() => {
                if (high && !confirming) return setConfirming(true);
                open(check.href);
                onClose();
              }}
            >
              {confirming ? "Yes, open it anyway" : "Open anyway"}
            </button>
          )}
        </div>
        <p className="foot">Checked on this device by Avaran. Nothing about this link was sent anywhere.</p>
      </div>
    </div>
  );
}
