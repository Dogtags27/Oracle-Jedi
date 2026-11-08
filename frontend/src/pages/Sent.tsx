import { useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Card } from "../components/ui";
import { LedgerPanel } from "../components/LedgerPanel";
import { loadSent, saveSent, type SentItem } from "../lib/sender";
import { SentList } from "./Request";

export default function SentPage() {
  const [items, setItems] = useState<SentItem[]>(() => loadSent());
  const update = (next: SentItem[]) => {
    setItems(next);
    saveSent(next);
  };
  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">My sealed documents</h1>
        <p className="mt-1 text-slate-400">Everything you sealed from this browser. Revoke anything, any time. If it hasn't been opened yet, it's destroyed for good.</p>
      </div>
      <div className="space-y-5">
        {items.length === 0 ? (
          <Card title="Nothing sealed from this browser yet">
            <p className="text-sm text-slate-400">
              Open a request link from your office, or <Link to="/check" className="text-jedi-400 underline">check who's asking</Link> first.
            </p>
          </Card>
        ) : (
          <SentList items={items} onChange={update} />
        )}
        <p className="text-xs text-slate-500">Your revoke keys live only in this browser's storage. Nobody else, including us, can revoke on your behalf.</p>
        <LedgerPanel />
      </div>
    </Layout>
  );
}
