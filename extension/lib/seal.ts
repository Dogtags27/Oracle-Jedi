import {
  PERSONAL_EMAIL_DOMAINS,
  bs,
  dnsRecordName,
  newPickupCode,
  newSecretToken,
  normalizeDomain,
  pickupCodeHash,
  registrableDomain,
  revokeTokenHash,
  sealForPerson,
  sealToOffice,
  sha256Hex,
  toB64,
  toB64Url,
  verifyBundle,
  verifyObject,
  type HandoffStatus,
  type OfficeKeyBundle,
  type RedactionSummary,
  type Sealed,
} from "@oj/core";
import { APP_URL, ApiError, apiFetch, lookupTxt, postJson } from "./api";
import type { VaultResult } from "./messages";

export interface OfficeView {
  domain: string;
  name: string;
  bundle: OfficeKeyBundle;
  fingerprint: string;
  safetyWords: string[];
  verified: boolean;
  verifiedAt: string | null;
}

export type DnsState = "match" | "missing" | "mismatch" | "error";

export type Recipient =
  | { kind: "office"; input: string; office: OfficeView; sigOk: boolean; dns: DnsState }
  | { kind: "person"; input: string };

export type Stage = "reserving" | "encrypting" | "uploading" | "finalizing" | "done";

export const STAGE_LABEL: Record<Stage, string> = {
  reserving: "Reserving a sealed slot…",
  encrypting: "Encrypting here · ML-KEM-768 + X25519 → AES-256-GCM",
  uploading: "Uploading ciphertext only…",
  finalizing: "Checking the server's ML-DSA receipt…",
  done: "Sealed ✓",
};

export interface SentItem extends VaultResult {
  id: string;
  recipient: string;
  officeDomain?: string;
  revokeToken: string;
  sentAt: string;
  receiptOk: boolean;
}

const SENT_KEY = "sent";

export const officeTrusted = (r: Recipient) => r.kind === "office" && r.sigOk && r.dns === "match";

export async function resolveRecipient(input: string): Promise<Recipient> {
  const value = input.trim().toLowerCase();
  const host = value.includes("@") ? (value.split("@")[1] ?? "") : normalizeDomain(value);
  const domain = host ? registrableDomain(host) : "";
  if (!domain || !domain.includes(".") || PERSONAL_EMAIL_DOMAINS.has(domain)) return { kind: "person", input: value };
  let office: OfficeView;
  try {
    office = await apiFetch<OfficeView>(`/offices/${encodeURIComponent(domain)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "person", input: value };
    throw e;
  }
  const check = await verifyBundle(office.bundle);
  const sigOk = check.ok && check.fingerprint === office.fingerprint && normalizeDomain(office.bundle.domain) === normalizeDomain(office.domain);
  let dns: DnsState = "missing";
  try {
    const fps = (await lookupTxt(dnsRecordName(office.domain)))
      .map((r) => r.match(/fp=([0-9a-f]{64})/i)?.[1]?.toLowerCase())
      .filter((fp): fp is string => Boolean(fp));
    dns = fps.length === 0 ? "missing" : fps.includes(check.fingerprint) ? "match" : "mismatch";
  } catch {
    dns = "error";
  }
  return { kind: "office", input: value, office, sigOk, dns };
}

let serverKey: Promise<string> | null = null;
const getServerKey = () => (serverKey ??= apiFetch<{ publicKey: string }>("/server-key").then((r) => r.publicKey));

export async function sealAndSend(
  file: File,
  recipient: Recipient,
  ttlMinutes: number,
  code: string | undefined,
  onStage: (stage: Stage) => void,
  redactions?: RedactionSummary,
): Promise<SentItem> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const meta = { name: file.name, type: file.type || "application/octet-stream", size: bytes.length, ...(redactions ? { redactions } : {}) };
  const revokeToken = newSecretToken();
  const office = recipient.kind === "office" ? recipient.office : undefined;
  onStage("reserving");
  const created = await postJson<{ id: string; uploadUrl: string; expiresAt: string }>("/handoffs", {
    mode: office ? "office" : "person",
    officeDomain: office?.domain,
    revokeTokenHash: await revokeTokenHash(revokeToken),
    expiresInMinutes: ttlMinutes,
  });
  onStage("encrypting");
  let sealed: Sealed;
  let k1: Uint8Array | undefined;
  let k2: Uint8Array | undefined;
  if (office) {
    sealed = await sealToOffice(bytes, meta, office.bundle, { id: created.id, ttlMinutes });
  } else {
    const person = await sealForPerson(bytes, meta, { id: created.id, ttlMinutes });
    sealed = person;
    k1 = person.k1;
    k2 = person.k2;
  }
  onStage("uploading");
  await apiFetch("", { method: "PUT", body: bs(sealed.ciphertext) as BodyInit, headers: { "Content-Type": "application/octet-stream" } }, created.uploadUrl);
  onStage("finalizing");
  const ctSha256 = await sha256Hex(sealed.ciphertext);
  const receipt = await postJson<{ id: string; ctSha256: string; paddedSize: number; storedAt: string; sig: string }>(`/handoffs/${created.id}/finalize`, {
    header: sealed.header,
    ctSha256,
    paddedSize: sealed.header.paddedSize,
    k2: k2 ? toB64(k2) : undefined,
    codeHash: k2 && code ? await pickupCodeHash(created.id, code) : undefined,
  });
  const { sig, ...body } = receipt;
  const receiptOk = body.ctSha256 === ctSha256 && verifyObject(body, sig, await getServerKey());
  onStage("done");
  const item: SentItem = {
    id: created.id,
    url: office ? `${APP_URL}/office#${created.id}` : `${APP_URL}/h/${created.id}#${toB64Url(k1!)}`,
    name: file.name,
    size: bytes.length,
    mode: office ? "office" : "person",
    officeName: office?.name,
    officeDomain: office?.domain,
    recipient: recipient.input,
    revokeToken,
    sentAt: new Date().toISOString(),
    expiresAt: created.expiresAt,
    receiptOk,
  };
  await saveSent([item, ...(await loadSent())]);
  return item;
}

export const newCode = newPickupCode;

export async function loadSent(): Promise<SentItem[]> {
  return ((await browser.storage.local.get(SENT_KEY))[SENT_KEY] as SentItem[] | undefined) ?? [];
}

export const saveSent = (items: SentItem[]) => browser.storage.local.set({ [SENT_KEY]: items.slice(0, 100) });

export const sentStatus = (item: SentItem) =>
  apiFetch<{ status: HandoffStatus; openedAt: string | null }>(`/handoffs/${item.id}/status`, { headers: { "X-Revoke-Token": item.revokeToken } });

export const revokeSent = (item: SentItem) =>
  apiFetch<{ status: HandoffStatus }>(`/handoffs/${item.id}`, { method: "DELETE", headers: { "X-Revoke-Token": item.revokeToken } });

export const toResult = (item: SentItem): VaultResult => ({
  url: item.url,
  name: item.name,
  size: item.size,
  mode: item.mode,
  officeName: item.officeName,
  expiresAt: item.expiresAt,
});
