import { useEffect, useId, useRef, useState } from "react";
import type { LinkCheck } from "@oj/core";
import type { Locale } from "@oj/core/i18n";
import { Tip, useContentLocale, useT } from "@oj/core/i18n/react";
import { FINDINGS, linkReasons } from "@oj/core/findings";

const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

export function Guard({
  check,
  officialDomain,
  officialName,
  language,
  onClose,
}: {
  check: LinkCheck;
  officialDomain?: string;
  officialName?: string;
  language?: Locale | null;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const stay = useRef<HTMLButtonElement>(null);
  const content = useContentLocale(language);
  const L = content.locale;
  const t = useT(FINDINGS, L);
  const titleId = useId();
  const descId = useId();
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
    <div className="oj backdrop" lang={L} onClick={onClose} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div
        className={`modal ${high ? "high" : "medium"}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="head">
          <div className={`dot ${high ? "mismatch" : "unknown"}`} aria-hidden="true">
            {high ? "✕" : "!"}
          </div>
          <div className="title" id={titleId}>
            {high ? t("guard.stop") : t("guard.check")}
          </div>
        </div>

        {check.host ? (
          <div className="row">
            <div className="label">{t("guard.reallyGoes")}</div>
            <div className="dest mono">
              <span className="dim">{sub}</span>
              <b>{check.domain || check.host}</b>
              <span className="dim">{path}</span>
            </div>
            {check.shownDomain && check.shownDomain !== check.domain && (
              <div className="sub">
                {t("guard.emailShows")} <span className="mono strong">{check.shownDomain}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="row dest mono">{check.href.slice(0, 80)}</div>
        )}

        <ul className="signals" id={descId}>
          {linkReasons(check, L).map((r) => (
            <li key={r}>
              <span aria-hidden="true">⚑ </span>
              {r}
            </li>
          ))}
        </ul>

        {officialDomain && (
          <div className="official">
            <span className="dim">{officialName ? t("guard.officialSiteOf", { name: officialName }) : t("guard.senderOfficialSite")}</span>
            <span className="mono accent">{officialDomain}</span>
          </div>
        )}

        <div className="actions">
          <button ref={stay} className="btn primary" onClick={onClose}>
            {t("guard.dontOpen")}
          </button>
          {officialDomain && (
            <Tip text={t("guard.tip.goOfficial")}>
              <button
                className="btn"
                onClick={() => {
                  open(`https://${officialDomain}`);
                  onClose();
                }}
              >
                {t("guard.goOfficial")}
              </button>
            </Tip>
          )}
          {canOpen && (
            <Tip text={t("guard.tip.openAnyway")}>
              <button
                className={`btn ${confirming ? "danger" : "quiet"}`}
                onClick={() => {
                  if (high && !confirming) return setConfirming(true);
                  open(check.href);
                  onClose();
                }}
              >
                {confirming ? t("guard.openAnywayConfirm") : t("guard.openAnyway")}
              </button>
            </Tip>
          )}
        </div>
        <p className="foot">{t("guard.foot")}</p>
      </div>
    </div>
  );
}
