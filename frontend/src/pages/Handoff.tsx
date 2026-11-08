import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fromB64, fromB64Url, openSealed, type EnvelopeHeader, type Meta } from "@oj/core";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, Input, PqTag, Spinner } from "../components/ui";
import { LedgerPanel } from "../components/LedgerPanel";
import { Viewer } from "../components/Viewer";
import { ApiError, api, getBytes } from "../lib/api";
import { countdown } from "../lib/format";

interface Info {
  id: string;
  status: string;
  header: EnvelopeHeader;
  downloadUrl: string;
  expiresAt: string;
}

export default function HandoffPage() {
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
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [opened, setOpened] = useState<{ data: Uint8Array; meta: Meta } | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (k1 && window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (!k1) {
      setError("This link is incomplete. Ask the sender to copy the whole link, including everything after #.");
      return;
    }
    api<Info>(`/handoffs/${id}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof ApiError && e.status === 410 ? "The sender revoked this, or it expired. It's been destroyed." : "This sealed document doesn't exist."));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
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
      if (e instanceof ApiError && e.status === 401) setCodeError(`Wrong code. ${String(e.body.attemptsLeft ?? "")} tries left before it's destroyed.`);
      else if (e instanceof ApiError && e.status === 410) setError("Too many wrong codes, so the document was destroyed. Ask the sender to send it again.");
      else setCodeError("Couldn't open it. The link may be damaged.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      {error && <Card title="Can't open this">{error}</Card>}
      {!error && !info && <Card>Loading sealed document…</Card>}
      {!error && info && (
        <div className="space-y-5">
          <Card title="Someone sealed a document for you" subtitle="It opens only in this browser, with the code the sender gave you separately." right={<PqTag />}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="blue">Sealed · {info.header.suite}</Badge>
              <span className="font-mono text-xs text-slate-400">self-destructs in {countdown(info.expiresAt, now)}</span>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div className="w-48">
                <Input
                  label="6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && code.length === 6 && unlock()}
                />
              </div>
              <Button variant="saber" onClick={unlock} disabled={busy || code.length !== 6}>
                {busy ? <Spinner /> : null} Unlock
              </Button>
            </div>
            {codeError && <p className="mt-2 text-sm text-sith">{codeError}</p>}
            <p className="mt-4 text-xs text-slate-500">
              The key is split in two: half is in this link (it never reaches any server), half is released once for the right code. Five wrong codes destroy it.
            </p>
          </Card>
          <LedgerPanel />
        </div>
      )}
      {opened && <Viewer data={opened.data} meta={opened.meta} onClose={() => setOpened(null)} receipt={false} />}
    </Layout>
  );
}
