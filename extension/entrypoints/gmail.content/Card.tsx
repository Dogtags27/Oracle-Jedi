import { useEffect, useState } from "react";
import type { CheckResponse } from "@oj/core";
import { languageName, translator } from "@oj/core/i18n";
import { Tip, useContentLocale, useFormat, useT } from "@oj/core/i18n/react";
import {
  FINDINGS,
  attachmentReason,
  checkExplanation,
  credentialLabel,
  isGoodSignal,
  itemLabel,
  linkReasons,
  pressureLabel,
  signalText,
} from "@oj/core/findings";
import { safeHttpUrl } from "@/lib/api";
import { riskyLinks, type Scan } from "./scan";

type Status = "idle" | "checking" | "done" | "error";

const LOOK = {
  verified: { cls: "verified", icon: "✓" },
  mismatch: { cls: "mismatch", icon: "✕" },
  unknown: { cls: "unknown", icon: "?" },
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

function Globe() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
    </svg>
  );
}

function signalRows(result: CheckResponse, locale: Parameters<typeof signalText>[1]) {
  const rows = result.facts
    ? result.facts.map((f) => ({ text: signalText(f, locale), good: isGoodSignal(result, f) }))
    : result.signals.map((s) => ({ text: s, good: isGoodSignal(result, s) }));
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.text) && Boolean(seen.add(r.text)));
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
  const x = scan.request;
  const content = useContentLocale(x.language);
  const L = content.locale;
  const t = useT(FINDINGS, L);
  const fmt = useFormat(L);

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

  const links = riskyLinks(scan, result);
  const highRisk = links.some((l) => l.level === "high") || scan.attachments.some((a) => a.level === "high");
  const look = result ? LOOK[result.verdict] : null;
  const cls = status === "checking" ? "checking" : look ? look.cls : highRisk ? "mismatch" : "unknown";
  const icon = status === "checking" ? "…" : look ? look.icon : highRisk ? "!" : "?";
  const title =
    status === "checking"
      ? t("card.checking")
      : result
        ? t(`verdict.${result.verdict}`)
        : status === "error"
          ? t("card.error")
          : highRisk
            ? t("card.trap")
            : t("card.whoAsking");
  const portal = safeHttpUrl(result?.officialUploadUrl);
  const switchTo = content.followingContent ? content.uiLocale : content.detected;
  const switchLabel = switchTo ? translator(FINDINGS, switchTo)("lang.showIn", { language: languageName(switchTo, switchTo) }) : "";
  const signals = result ? signalRows(result, L) : [];

  return (
    <div className="oj" lang={L}>
      <div className={`card ${cls}`} role="region" aria-label={`Avaran: ${title}`}>
        <div className="head">
          {result ? (
            <Tip text={t(`verdict.${result.verdict}.tip`)}>
              <div className={`dot ${cls}`} tabIndex={0} role="img" aria-label={title}>
                {icon}
              </div>
            </Tip>
          ) : (
            <div className={`dot ${cls} ${status === "checking" ? "pulse" : ""}`} aria-hidden="true">
              {icon}
            </div>
          )}
          <div className="grow" aria-live="polite">
            <div className="title">{title}</div>
            <div className="sub">
              {t("card.claimsToBe")} <b>{x.claimedOrg || "?"}</b>
              {scan.senderEmail && (
                <>
                  {" "}
                  · {t("card.sentFrom")} <span className="mono">{scan.senderEmail}</span>
                </>
              )}
              {result?.officialDomain && (
                <>
                  {" "}
                  · {t("card.officialSite")} <span className="mono accent">{result.officialDomain}</span>
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
            <Tip text={t("tip.dismiss")}>
              <button className="x" onClick={() => setHidden(true)} aria-label={t("card.dismiss")}>
                ✕
              </button>
            </Tip>
          </div>
        </div>

        {content.detected && content.canSwitch && (
          <div className="langbar">
            <Tip text={t("lang.tip", { language: languageName(content.detected, L) })}>
              <span className="lang" tabIndex={0}>
                <Globe />
                {t("lang.detected", { language: languageName(content.detected, L) })}
              </span>
            </Tip>
            <button className="link-btn" lang={switchTo ?? undefined} onClick={content.toggle}>
              {switchLabel}
            </button>
          </div>
        )}

        {(x.requestedItems.length > 0 || x.credentialAsks.length > 0 || x.pressureSignals.length > 0) && (
          <div className="pills">
            {x.requestedItems.length > 0 && (
              <Tip text={t("tip.asksFor")}>
                <span className="lead">{t("card.asksFor")}</span>
              </Tip>
            )}
            {x.requestedItems.map((i) => (
              <span key={i} className="pill red">
                {itemLabel(i, L)}
              </span>
            ))}
            {x.credentialAsks.map((i) => (
              <span key={i} className="pill red">
                {credentialLabel(i, L)}
              </span>
            ))}
            {x.pressureSignals.map((p) => (
              <Tip key={p} text={t("tip.pressure")}>
                <span className="pill amber">{pressureLabel(p, L)}</span>
              </Tip>
            ))}
          </div>
        )}

        {result && <p className="expl">{checkExplanation(result, L)}</p>}
        {x.credentialAsks.length > 0 && result?.verdict !== "verified" && <p className="expl warn">{t("card.noPasswords")}</p>}

        {signals.length > 0 && (
          <ul className="signals">
            {signals.slice(0, 5).map((s) => (
              <li key={s.text} className={s.good ? "good" : ""}>
                <span aria-hidden="true">⚑ </span>
                {s.text}
              </li>
            ))}
          </ul>
        )}

        {(result?.officialPhone || portal) && (
          <div className="official">
            <Tip text={t("tip.officialChannel")}>
              <span className="dim">{result?.verdict === "verified" ? t("card.officialChannel") : t("card.useOfficialChannel")}</span>
            </Tip>
            {result?.officialPhone && <span className="mono strong">{t("card.tel", { phone: result.officialPhone })}</span>}
            {portal && (
              <a href={portal} target="_blank" rel="noopener noreferrer">
                {t("card.officialPortal")}
              </a>
            )}
          </div>
        )}

        {links.length > 0 && (
          <div className="row">
            <Tip text={t("tip.guardedLinks")}>
              <div className="label">{t("card.linksGuarded")}</div>
            </Tip>
            {links.slice(0, 4).map((l) => (
              <div key={l.href} className={`link ${l.level}`}>
                <span className="lvl" aria-hidden="true">
                  {l.level === "high" ? "!" : "△"}
                </span>
                <div>
                  <Host host={l.host} domain={l.domain} />
                  <div className="why">{linkReasons(l, L).join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {scan.attachments.length > 0 && (
          <div className="row">
            <div className="label">{t("card.attachments")}</div>
            {scan.attachments.map((a) => (
              <div key={a.name} className={`link ${a.level}`}>
                <span className="lvl" aria-hidden="true">
                  !
                </span>
                <div>
                  <span className="mono">
                    <b>{a.name}</b>
                  </span>
                  <div className="why">{attachmentReason(a, L)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {result && result.evidence.length > 0 && (
          <div className="row">
            <Tip text={t("tip.proof")}>
              <button className="link-btn" aria-expanded={proof} onClick={() => setProof(!proof)}>
                {t(proof ? "card.hideProof" : "card.showProof", { count: result.evidence.length })}
              </button>
            </Tip>
            {proof && (
              <div className="evidence">
                {result.evidence.map((e, i) => {
                  const href = safeHttpUrl(e.url);
                  return (
                    <a key={i} href={href} target="_blank" rel="noopener noreferrer">
                      <span>"{e.quote}"</span>
                      <span className="src">
                        <span className="mono accent">{e.url.replace(/^https?:\/\//, "").slice(0, 70)}</span>
                        {e.verified && <span className="pill green">{t("card.verifiedLive")}</span>}
                        <span className="pill slate">{t(`source.${e.source}`)}</span>
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
            <Tip text={t("tip.checkWho")}>
              <button className="btn primary" onClick={run}>
                {t("card.checkWho")}
              </button>
            </Tip>
          )}
          {status === "error" && canCheck && (
            <button className="btn" onClick={run}>
              {t("card.tryAgain")}
            </button>
          )}
          <span>{t("card.footer")}</span>
          <Tip text={t("tip.whatLeft")}>
            <button className="link-btn" onClick={onLedger}>
              {t("card.whatLeft")}
            </button>
          </Tip>
          {result && (
            <Tip text={t("tip.source")}>
              <span className="dim" tabIndex={0}>
                {t("card.latency", { seconds: fmt.fixed(result.latencyMs / 1000, 1), source: t(`source.${result.source}`) })}
              </span>
            </Tip>
          )}
        </div>
      </div>
    </div>
  );
}
