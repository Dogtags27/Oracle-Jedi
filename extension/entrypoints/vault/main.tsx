import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tip, useT } from "@oj/core/i18n/react";
import { ExtI18n } from "@/lib/i18n";
import { VAULT } from "@/locales/vault";
import { SealFlow } from "@/components/SealFlow";
import { Mark } from "@/components/ui";
import { vaultKey, type TabMessage, type VaultRecord } from "@/lib/messages";
import { toResult } from "@/lib/seal";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "@fontsource/eczar/500.css";
import "@fontsource/eczar/600.css";
import "@/assets/style.css";

const GMAIL = "https://mail.google.com";
const nonce = location.hash.slice(1);

async function claimContext(): Promise<VaultRecord | null> {
  const framedByGmail = window.top !== window && location.ancestorOrigins?.[0] === GMAIL;
  if (!framedByGmail || !/^[0-9a-f-]{36}$/.test(nonce)) return null;
  const key = vaultKey(nonce);
  const record = (await browser.storage.session.get(key))[key] as VaultRecord | undefined;
  await browser.storage.session.remove(key);
  if (!record || Date.now() - record.createdAt > 10 * 60_000) return null;
  return record;
}

const claimed = claimContext().catch(() => null);

const tell = (tabId: number, message: TabMessage) => browser.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => {});

function Vault() {
  const t = useT(VAULT);
  const [ctx, setCtx] = useState<VaultRecord | null | undefined>(undefined);
  useEffect(() => {
    claimed.then(setCtx);
  }, []);
  useEffect(() => {
    document.title = t("title");
  }, [t]);

  if (ctx === undefined)
    return (
      <p role="status" className="p-4 text-sm text-slate-400">
        {t("opening")}
      </p>
    );
  if (ctx === null) {
    return (
      <div className="p-4 text-sm text-slate-300">
        <p role="alert" className="font-semibold text-sith">
          {t("denied")}
        </p>
      </div>
    );
  }
  const close = () => tell(ctx.tabId, { type: "vault:close", nonce });
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2.5 border-b border-line bg-card px-4 py-3">
        <Mark className="h-6 w-6" />
        <h1 className="font-display text-[17px] font-semibold leading-none">{t("heading")}</h1>
        <Tip text={t("subtitle.tip")} side="bottom">
          <span tabIndex={0} className="min-w-0 text-[12px] text-ink-3">
            {t("subtitle")}
          </span>
        </Tip>
        <Tip text={t("close")} side="bottom">
          <button onClick={close} className="ml-auto shrink-0 rounded px-2 text-slate-400 hover:bg-ink/10 hover:text-ink" aria-label={t("close")}>
            <span aria-hidden="true">✕</span>
          </button>
        </Tip>
      </header>
      <main className="flex-1 overflow-auto p-4">
        <SealFlow
          recipients={ctx.recipients}
          flag={ctx.flag}
          onSealed={(items) => tell(ctx.tabId, { type: "vault:result", nonce, results: items.map(toResult) })}
          onClose={close}
        />
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExtI18n syncDocument>
      <Vault />
    </ExtI18n>
  </StrictMode>,
);
