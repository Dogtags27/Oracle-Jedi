import type { CheckRequest, CheckResponse } from "@oj/core";

export interface ThreadFlag {
  verdict: CheckResponse["verdict"];
  claimedOrg: string;
  officialDomain?: string;
  officialPhone?: string;
  officialUploadUrl?: string;
  explanation: string;
  sender?: string;
  localized?: boolean;
}

export interface VaultContext {
  recipients: string[];
  flag?: ThreadFlag;
}

export interface VaultRecord extends VaultContext {
  tabId: number;
  createdAt: number;
}

export interface VaultResult {
  url: string;
  name: string;
  size: number;
  mode: "office" | "person";
  officeName?: string;
  expiresAt: string;
}

export type Message =
  | { type: "check"; request: CheckRequest }
  | { type: "vault:open"; nonce: string; context: VaultContext }
  | { type: "panel:open"; tab: PanelTab; text?: string }
  | { type: "sheathe:signal"; phase: string; id: string; surface?: string; handle?: string | null; hasHandle: boolean; veil?: boolean }
  | { type: "sheathe:hello"; handle: string }
  | { type: "sheathe:boxes"; handle: string; boxes: [number, number, number, number][] }
  | { type: "sheathe:set"; mode: "off" | "manual" | "panic" }
  | { type: "sheathe:inject" }
  | { type: "guard:enable"; matches?: string[] }
  | { type: "guard:disable" }
  | { type: "guard:inject" };

export type TabMessage =
  | { type: "vault:result"; nonce: string; results: VaultResult[] }
  | { type: "vault:close"; nonce: string }
  | { type: "sheathe:veil"; handle: string; boxes?: [number, number, number, number][]; none?: boolean }
  | { type: "sheathe:resend" };

export type PanelTab = "check" | "seal" | "sheathe" | "guard" | "sent" | "ledger";

export interface PanelIntent {
  tab: PanelTab;
  text?: string;
  at: number;
}

export async function send<T>(message: Message): Promise<T> {
  const reply = (await browser.runtime.sendMessage(message)) as { ok: true; data: T } | { ok: false; error: string } | undefined;
  if (!reply) throw new Error("no_reply");
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}

export const vaultKey = (nonce: string) => `vault:${nonce}`;
export const PANEL_INTENT = "panel:intent";
