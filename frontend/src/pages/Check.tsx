import { useMemo, useState } from "react";
import { extractRequest, type CheckRequest, type CheckResponse } from "@oj/core";
import { Layout } from "../components/Layout";
import { Badge, Button, Card, Input, Spinner } from "../components/ui";
import { VerdictCard } from "../components/VerdictCard";
import { LedgerPanel } from "../components/LedgerPanel";
import { api } from "../lib/api";

const SAMPLE_FROM = "Maple Street Tax <maplestreet.tax.help@gmail.com>";
const SAMPLE_BODY = `[TRAINING SAMPLE]
Hi,
This is Maple Street Tax. To finish your 2025 return we need your W-2 and a photo of your driver's license today.
Please upload here: https://maple-street-taxdocs.co/upload
Questions? Call (617) 555-0142

Maple Street Tax`;

export default function CheckPage() {
  const [from, setFrom] = useState("");
  const [body, setBody] = useState("");
  const [org, setOrg] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");

  const extracted = useMemo(() => extractRequest(body, from), [body, from]);
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
      setError("Check failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout wide>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Who's asking?</h1>
        <p className="mt-1 text-slate-400">Paste a message that asks for documents. We read it on this device and check the sender against the organization's real website.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-5">
          <Card
            title="The message"
            right={
              <Button
                variant="ghost"
                onClick={() => {
                  setFrom(SAMPLE_FROM);
                  setBody(SAMPLE_BODY);
                  setOrg("");
                }}
              >
                Load training sample
              </Button>
            }
          >
            <div className="space-y-3">
              <Input label="From" placeholder="Name <sender@example.com>" value={from} onChange={(e) => setFrom(e.target.value)} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">Message</span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={9}
                  placeholder="Paste the email or text message…"
                  className="w-full rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 outline-none focus:ring-jedi-400"
                />
              </label>
            </div>
          </Card>
          <Card title="Read on this device" subtitle="Nothing above has left your browser.">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {extracted.isDocumentRequest ? <Badge tone="amber">Asks for sensitive documents</Badge> : <Badge tone="slate">No document request detected</Badge>}
                {extracted.requestedItems.map((i) => (
                  <Badge key={i} tone="red">
                    {i}
                  </Badge>
                ))}
                {extracted.pressureSignals.map((p) => (
                  <Badge key={p} tone="amber">
                    {p}
                  </Badge>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Claims to be" value={claimedOrg} onChange={(e) => setOrg(e.target.value)} />
                <Input label="City / state (optional)" placeholder="Boston, MA" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
              <p className="text-slate-400">
                Sender <span className="font-mono text-slate-200">{extracted.senderEmail || "—"}</span>
                {extracted.linkDomains.length > 0 && (
                  <>
                    {" "}
                    · links to <span className="font-mono text-slate-200">{extracted.linkDomains.join(", ")}</span>
                  </>
                )}
                {extracted.phones.length > 0 && (
                  <>
                    {" "}
                    · phone <span className="font-mono text-slate-200">{extracted.phones.join(", ")}</span>
                  </>
                )}
              </p>
              <p className="rounded-lg bg-jedi-500/10 px-3 py-2 text-xs text-jedi-400 ring-1 ring-jedi-400/20">
                Search providers will only see: "{claimedOrg || "…"}{location ? ` ${location}` : ""} official website". Never the message, never the sender.
              </p>
              <Button variant="saber" onClick={run} disabled={busy || claimedOrg.trim().length < 2}>
                {busy ? <Spinner /> : null} {busy ? "Checking the open web…" : "Check who's asking"}
              </Button>
              {error && <p className="text-sm text-sith">{error}</p>}
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          {result ? <VerdictCard result={result} /> : <Card title="Verdict">Run a check to see who's really asking.</Card>}
          <LedgerPanel />
        </div>
      </div>
    </Layout>
  );
}
