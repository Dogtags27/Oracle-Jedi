import {
  generateOfficeKeys,
  unlockKeys,
  loginMessage,
  lockKeys,
  openSealed,
  signMessage,
  signObject,
  type KeyKit,
  type Meta,
  type OfficeKeys,
  type EnvelopeHeader,
} from "@oj/core";
import { api, getBytes } from "./api";
import type { HandoffSummary, OfficeRequest, OfficeView } from "./types";

const KIT_KEY = "oj.office.kit";

export function loadKit(): KeyKit | null {
  try {
    const raw = localStorage.getItem(KIT_KEY);
    return raw ? (JSON.parse(raw) as KeyKit) : null;
  } catch {
    return null;
  }
}

export const saveKit = (kit: KeyKit) => localStorage.setItem(KIT_KEY, JSON.stringify(kit));
export const clearKit = () => localStorage.removeItem(KIT_KEY);

export async function createOffice(name: string, domain: string, passphrase: string) {
  const keys = generateOfficeKeys(domain, name);
  const kit = await lockKeys(keys, passphrase);
  const office = await api<OfficeView>("/offices", { json: keys.bundle });
  saveKit(kit);
  return { keys, kit, office };
}

export async function unlock(kit: KeyKit, passphrase: string) {
  const keys = await unlockKeys(kit, passphrase);
  await api<OfficeView>("/offices", { json: keys.bundle });
  return keys;
}

export async function login(keys: OfficeKeys) {
  const ts = Date.now();
  return api<{ token: string; office: OfficeView }>(`/offices/${keys.bundle.domain}/session`, {
    json: { ts, sig: signMessage(loginMessage(keys.bundle.domain, ts), keys.secret.sigSk) },
  });
}

export const checkDns = (domain: string) =>
  api<OfficeView & { dnsFound: boolean; dnsMatch: boolean }>(`/offices/${domain}/verify`, { method: "POST" });

export const listHandoffs = (token: string) => api<{ handoffs: HandoffSummary[] }>("/office/handoffs", { token, poll: true });
export const listRequests = (token: string) => api<{ requests: OfficeRequest[] }>("/office/requests", { token, poll: true });

export const createRequest = (token: string, checklist: string[], note: string, expiresInMinutes: number) =>
  api<OfficeRequest>("/office/requests", { token, json: { checklist, note: note || undefined, expiresInMinutes } });

export async function openHandoff(id: string, token: string, keys: OfficeKeys): Promise<{ data: Uint8Array; meta: Meta }> {
  const info = await api<{ header: EnvelopeHeader; downloadUrl: string }>(`/handoffs/${id}`, { token });
  const ciphertext = await getBytes(info.downloadUrl);
  const opened = await openSealed({ header: info.header, ciphertext }, keys.secret);
  const openedAt = new Date().toISOString();
  await api(`/handoffs/${id}/opened`, {
    token,
    json: { openedAt, sig: signObject({ id, openedAt, type: "opened" }, keys.secret.sigSk) },
  });
  return opened;
}

export function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
