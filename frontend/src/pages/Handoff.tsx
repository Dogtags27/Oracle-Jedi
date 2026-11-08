import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fromB64, fromB64Url, openSealed, type EnvelopeHeader, type Meta } from "@oj/core";
import { Tip, useFormat, useT } from "@oj/core/i18n/react";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, Input, PqTag, Spinner } from "../components/ui";
import { LedgerPanel } from "../components/LedgerPanel";
import { Viewer } from "../components/Viewer";
import { ApiError, api, getBytes } from "../lib/api";
import { HANDOFF } from "../locales/handoff";

interface Info {
  id: string;
  status: string;
  header: EnvelopeHeader;
  downloadUrl: string;
  expiresAt: string;
}

type Problem = "" | "error.incomplete" | "error.gone" | "error.missing" | "error.tooMany";
type CodeProblem = "" | "code.damaged" | { left: number | null };

export default function HandoffPage() {
  const t = useT(HANDOFF);
  const fmt = useFormat();
  const { id = "" } = useParams();
  const [k1] = useState(() => {
    const fragment = window.location.hash.slice(1);
    try {
      const key = fromB64Url(fragment);
      return key.length === 32 ? key : null;
    } catch {
      return null;
    }
  });
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<Problem>("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<CodeProblem>("");
  const [opened, setOpened] = useState<{ data: Uint8Array; meta: Meta } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (k1 && window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    if (!k1) {
      setError("error.incomplete");
      return;
    }
    api<Info>(`/handoffs/${id}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof ApiError && e.status === 410 ? "error.gone" : "error.missing"));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [id, k1]);

  async function unlock() {
    if (!info || !k1) return;
    setBusy(true);
    setCodeError("");
    try {
      const { k2 } = await api<{ k2: string }>(`/handoffs/${id}/k2`, { json: { code: code.trim() } });
      const fresh = await api<Info>(`/handoffs/${id}`);
      const ciphertext = await getBytes(fresh.downloadUrl);
      setOpened(await openSealed({ header: fresh.header, ciphertext }, { k1, k2: fromB64(k2) }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        const left = Number(e.body.attemptsLeft);
        setCodeError({ left: e.body.attemptsLeft !== undefined && Number.isFinite(left) ? left : null });
      } else if (e instanceof ApiError && e.status === 410) setError("error.tooMany");
      else setCodeError("code.damaged");
    } finally {
      setBusy(false);
    }
  }

  const codeMessage =
    codeError === "" ? "" : codeError === "code.damaged" ? t("code.damaged") : codeError.left === null ? t("code.wrongNoCount") : t("code.wrong", { count: codeError.left });

  const unlockButton = (
    <Button variant="saber" onClick={unlock} disabled={busy || code.length !== 6}>
      {busy ? <Spinner /> : null} {t("unlock")}
    </Button>
  );

  return (
    <Layout>
      {error && (
        <div role="alert">
          <Card title={t("error.title")}>{t(error)}</Card>
        </div>
      )}
      {!error && !info && (
        <div role="status">
          <Card>{t("loading")}</Card>
        </div>
      )}
      {!error && info && (
        <div className="space-y-5">
          <Card title={t("title")} subtitle={t("subtitle")} right={<PqTag />}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Tip text={t("sealed.tip")}>
                <span tabIndex={0} className="inline-flex rounded-full">
                  <Badge tone="blue">{t("sealed", { suite: info.header.suite })}</Badge>
                </span>
              </Tip>
              <Tip text={t("expires.tip")}>
                <span tabIndex={0} className="cursor-help font-mono text-xs text-slate-400">
                  {t("expires", { time: fmt.countdown(info.expiresAt, now) })}
                </span>
              </Tip>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="w-48">
                <Input
                  label={t("code")}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  aria-invalid={codeError ? true : undefined}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 6 && unlock()}
                />
              </div>
              {busy ? unlockButton : <Tip text={t("unlock.tip")}>{unlockButton}</Tip>}
            </div>
            <div aria-live="assertive">{codeMessage && <p className="mt-2 text-sm text-sith">{codeMessage}</p>}</div>
            <p className="mt-4 text-xs text-slate-500">{t("split")}</p>
          </Card>
          <LedgerPanel />
        </div>
      )}
      {opened && <Viewer data={opened.data} meta={opened.meta} onClose={() => setOpened(null)} receipt={false} />}
    </Layout>
  );
}
