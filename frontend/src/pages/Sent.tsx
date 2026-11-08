import { useState } from "react";
import { Link } from "react-router-dom";
import { TipIcon, useT } from "@oj/core/i18n/react";
import { Layout } from "../components/Layout";
import { Card } from "../components/ui";
import { LedgerPanel } from "../components/LedgerPanel";
import { loadSent, saveSent, type SentItem } from "../lib/sender";
import { SENT } from "../locales/sent";
import { SentList } from "./Request";

export default function SentPage() {
  const t = useT(SENT);
  const [items, setItems] = useState<SentItem[]>(() => loadSent());
  const update = (next: SentItem[]) => {
    setItems(next);
    saveSent(next);
  };
  const [before, after = ""] = t("empty.body").split("{link}");
  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-slate-400">{t("intro")}</p>
      </div>
      <div className="space-y-5">
        {items.length === 0 ? (
          <Card title={t("empty.title")}>
            <p className="text-sm text-slate-400">
              {before}
              <Link to="/check" className="text-jedi-400 underline">
                {t("empty.link")}
              </Link>
              {after}
            </p>
          </Card>
        ) : (
          <SentList items={items} onChange={update} />
        )}
        <p className="flex items-start gap-2 text-xs text-slate-500">
          <span>{t("keys")}</span>
          <TipIcon text={t("keys.tip")} label={t("keys.label")} />
        </p>
        <LedgerPanel />
      </div>
    </Layout>
  );
}
