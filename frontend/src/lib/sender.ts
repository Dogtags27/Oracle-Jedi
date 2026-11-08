import { newSecretToken, revokeTokenHash, sealToOffice, sha256Hex, verifyBundle, verifyObject, type RedactionSummary } from "@oj/core";
import { api, getServerKey, putBytes } from "./api";
import type { HandoffSummary, PublicRequest, Receipt } from "./types";

export type Stage = "reserving" | "encrypting" | "uploading" | "finalizing" | "done";

export interface SentItem {
  id: string;
  name: string;
  size: number;
  officeDomain: string;
  officeName: string;
  revokeToken: string;
  sentAt: string;
  expiresAt: string;
  receiptOk: boolean;
  ctSha256: string;
}

const SENT_KEY = "oj.sent";

export function loadSent(): SentItem[] {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? "[]") as SentItem[];
  } catch {
    return [];
  }
}

export function saveSent(items: SentItem[]) {
  localStorage.setItem(SENT_KEY, JSON.stringify(items.slice(0, 100)));
}

export async function checkOfficeBundle(request: PublicRequest) {
  const check = await verifyBundle(request.office.bundle);
  return check.ok && check.fingerprint === request.office.fingerprint;
}

export async function sendToOffice(
  file: { name: string; type: string; bytes: Uint8Array; redactions?: RedactionSummary },
  request: PublicRequest,
  ttlMinutes: number,
  onStage: (stage: Stage) => void,
): Promise<SentItem> {
  const revokeToken = newSecretToken();
  onStage("reserving");
  const created = await api<{ id: string; uploadUrl: string; expiresAt: string }>("/handoffs", {
    json: {
      mode: "office",
      officeDomain: request.office.domain,
      requestId: request.id,
      revokeTokenHash: await revokeTokenHash(revokeToken),
      expiresInMinutes: ttlMinutes,
    },
  });
  onStage("encrypting");
  const sealed = await sealToOffice(
    file.bytes,
    { name: file.name, type: file.type || "application/octet-stream", size: file.bytes.length, ...(file.redactions ? { redactions: file.redactions } : {}) },
    request.office.bundle,
    { id: created.id, ttlMinutes },
  );
  onStage("uploading");
  await putBytes(created.uploadUrl, sealed.ciphertext);
  onStage("finalizing");
  const ctSha256 = await sha256Hex(sealed.ciphertext);
  const receipt = await api<Receipt>(`/handoffs/${created.id}/finalize`, {
    json: { header: sealed.header, ctSha256, paddedSize: sealed.header.paddedSize },
  });
  const { sig, ...body } = receipt;
  const receiptOk = body.ctSha256 === ctSha256 && verifyObject(body, sig, await getServerKey());
  onStage("done");
  return {
    id: created.id,
    name: file.name,
    size: file.bytes.length,
    officeDomain: request.office.domain,
    officeName: request.office.name,
    revokeToken,
    sentAt: new Date().toISOString(),
    expiresAt: created.expiresAt,
    receiptOk,
    ctSha256,
  };
}

export const sentStatus = (item: SentItem) =>
  api<HandoffSummary & { openReceipt: unknown }>(`/handoffs/${item.id}/status`, { headers: { "X-Revoke-Token": item.revokeToken }, poll: true });

export const revokeSent = (item: SentItem) =>
  api<HandoffSummary>(`/handoffs/${item.id}`, { method: "DELETE", headers: { "X-Revoke-Token": item.revokeToken } });
