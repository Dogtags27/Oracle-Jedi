import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
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
  const [ctx, setCtx] = useState<VaultRecord | null | undefined>(undefined);
  useEffect(() => {
    claimed.then(setCtx);
  }, []);

  if (ctx === undefined) return <p className="p-4 text-sm text-slate-400">Opening the vault…</p>;
  if (ctx === null) {
    return (
      <div className="p-4 text-sm text-slate-300">
        <p className="font-semibold text-sith">This vault can only be opened from the Seal & Attach button in Gmail.</p>
      </div>
    );
  }
  const close = () => tell(ctx.tabId, { type: "vault:close", nonce });
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2.5 border-b border-line bg-card px-4 py-3">
        <Mark className="h-6 w-6" />
        <p className="font-display text-[17px] font-semibold leading-none">Seal & Attach</p>
        <span className="text-[12px] text-ink-3">Avaran vault · Gmail can't see inside</span>
        <button onClick={close} className="ml-auto rounded px-2 text-slate-400 hover:bg-ink/10 hover:text-ink" aria-label="Close">
          ✕
        </button>
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
    <Vault />
  </StrictMode>,
);
