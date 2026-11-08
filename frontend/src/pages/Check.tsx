import { useMemo, useState } from "react";
import { extractRequest, type CheckRequest, type CheckResponse } from "@oj/core";
import { languageName, translator } from "@oj/core/i18n";
import { Tip, TipIcon, useContentLocale, useI18n, useT } from "@oj/core/i18n/react";
import { FINDINGS, credentialLabel, itemLabel, pressureLabel } from "@oj/core/findings";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, Input, Spinner } from "../components/ui";
import { VerdictCard } from "../components/VerdictCard";
import { LedgerPanel } from "../components/LedgerPanel";
import { api } from "../lib/api";
import { CHECK } from "../locales/check";

const SAMPLE_FROM = "Maple Street Tax <maplestreet.tax.help@gmail.com>";

function LanguageNote({ content }: { content: ReturnType<typeof useContentLocale> }) {
  const { findingsMode, setFindingsMode } = useI18n();
  const ft = useT(FINDINGS);
  const t = useT(FINDINGS, content.locale);
  if (!content.detected) return null;
  const switchTo = content.followingContent ? content.uiLocale : content.detected;
  const name = languageName(content.detected, content.locale);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
      <Tip text={t("lang.tip", { language: name })}>
        <span tabIndex={0} className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-neel-200 bg-neel-50 px-2.5 py-0.5 font-medium text-neel-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
          </svg>
          {t("lang.detected", { language: name })}
        </span>
      </Tip>
      {content.canSwitch && switchTo && (
        <button type="button" lang={switchTo} onClick={content.toggle} className="text-neel-700 underline decoration-neel-200 underline-offset-2 hover:decoration-neel-600">
          {translator(FINDINGS, switchTo)("lang.showIn", { language: languageName(switchTo, switchTo) })}
        </button>
      )}
      <Tip text={ft("lang.setting.tip")}>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-ink-3">
          <input type="checkbox" className="accent-neel-700" checked={findingsMode === "content"} onChange={(e) => setFindingsMode(e.target.checked ? "content" : "ui")} />
          {ft("lang.setting")}
        </label>
      </Tip>
    </div>
  );
}

export default function CheckPage() {
  const [from, setFrom] = useState("");
  const [body, setBody] = useState("");
  const [org, setOrg] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  const t = useT(CHECK);
  const ft = useT(FINDINGS);

  const extracted = useMemo(() => extractRequest(body, from), [body, from]);
  const content = useContentLocale(extracted.language);
  const L = content.locale;
  const lt = useT(FINDINGS, L);
  const claimedOrg = org || extracted.claimedOrg;

  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const payload: CheckRequest = {
        claimedOrg,
        senderEmail: extracted.senderEmail || undefined,
        senderDomain: extracted.senderDomain,
        linkDomains: extracted.linkDomains,
        phones: extracted.phones,
        locationHint: location || undefined,
      };
      setResult(await api<CheckResponse>("/check", { json: payload }));
    } catch {
      setError(t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout wide>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{ft("card.whoAsking")}</h1>
        <p className="mt-1 text-slate-400">{t("intro")}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <Card
            title={t("message")}
            right={
              <Tip text={t("loadSample.tip")}>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setFrom(SAMPLE_FROM);
                    setBody(t("sampleBody"));
                    setOrg("");
                  }}
                >
                  {t("loadSample")}
                </Button>
              </Tip>
            }
          >
            <div className="space-y-3">
              <Input label={t("from")} placeholder={t("fromPlaceholder")} value={from} onChange={(e) => setFrom(e.target.value)} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">{t("body")}</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  placeholder={t("bodyPlaceholder")}
                  className="w-full rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-slate-100 ring-1 ring-ink/10 outline-none focus:ring-jedi-400"
                />
              </label>
            </div>
          </Card>
          <Card title={t("readHere")} subtitle={t("readHereSub")}>
            <div className="space-y-3 text-sm">
              <LanguageNote content={content} />
              <div className="flex flex-wrap gap-2" lang={L} aria-live="polite">
                {extracted.isDocumentRequest ? (
                  <Tip text={lt("tip.asksFor")}>
                    <span tabIndex={0}>
                      <Badge tone="amber">{translator(CHECK, L)("asksDocs")}</Badge>
                    </span>
                  </Tip>
                ) : (
                  <Badge tone="slate">{translator(CHECK, L)("noRequest")}</Badge>
                )}
                {extracted.requestedItems.map((i) => (
                  <Badge key={i} tone="red">
                    {itemLabel(i, L)}
                  </Badge>
                ))}
                {extracted.credentialAsks.map((c) => (
                  <Badge key={c} tone="red">
                    {credentialLabel(c, L)}
                  </Badge>
                ))}
                {extracted.pressureSignals.map((p) => (
                  <Tip key={p} text={lt("tip.pressure")}>
                    <span tabIndex={0}>
                      <Badge tone="amber">{pressureLabel(p, L)}</Badge>
                    </span>
                  </Tip>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label={ft("card.claimsToBe")} value={claimedOrg} onChange={(e) => setOrg(e.target.value)} />
                <div className="relative">
                  <Input label={t("city")} placeholder={t("cityPlaceholder")} value={location} onChange={(e) => setLocation(e.target.value)} />
                  <span className="absolute right-0 top-0">
                    <TipIcon text={t("city.tip")} label={t("city")} />
                  </span>
                </div>
              </div>
              <p className="text-slate-400">
                {t("sender")} <span className="font-mono text-slate-200">{extracted.senderEmail || "—"}</span>
                {extracted.linkDomains.length > 0 && (
                  <>
                    {" "}
                    · {t("linksTo")} <span className="font-mono text-slate-200">{extracted.linkDomains.join(", ")}</span>
                  </>
                )}
                {extracted.phones.length > 0 && (
                  <>
                    {" "}
                    · {t("phone")} <span className="font-mono text-slate-200">{extracted.phones.join(", ")}</span>
                  </>
                )}
              </p>
              <p className="rounded-lg bg-jedi-500/10 px-3 py-2 text-xs text-jedi-400 ring-1 ring-jedi-400/20">
                {t("providersSee", { query: `${claimedOrg || "…"}${location ? ` ${location}` : ""}` })}
              </p>
              <Tip text={ft("tip.checkWho")}>
                <Button variant="saber" onClick={run} disabled={busy || claimedOrg.trim().length < 2}>
                  {busy ? <Spinner /> : null} {busy ? ft("card.checkingWeb") : ft("card.checkWho")}
                </Button>
              </Tip>
              {error && (
                <p role="alert" className="text-sm text-sith">
                  {error}
                </p>
              )}
            </div>
          </Card>
        </div>
        <div className="space-y-5" aria-live="polite">
          {result ? <VerdictCard result={result} locale={L} /> : <Card title={t("verdict")}>{t("runHint")}</Card>}
          <LedgerPanel />
        </div>
      </div>
    </Layout>
  );
}
