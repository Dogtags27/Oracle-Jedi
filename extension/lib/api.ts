import type { LedgerEntry } from "@oj/core";

export const API_BASE = import.meta.env.WXT_API_BASE_URL ?? "http://localhost:8787/api";
export const APP_URL = (import.meta.env.WXT_APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
export const DOH_URL = import.meta.env.WXT_DOH_RESOLVER_URL ?? "https://cloudflare-dns.com/dns-query";

const LEDGER_KEY = "ledger";
const LEDGER_MAX = 200;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

let writing: Promise<void> = Promise.resolve();

function record(entry: LedgerEntry) {
  writing = writing.then(async () => {
    const current = (await browser.storage.local.get(LEDGER_KEY))[LEDGER_KEY] as LedgerEntry[] | undefined;
    await browser.storage.local.set({ [LEDGER_KEY]: [entry, ...(current ?? [])].slice(0, LEDGER_MAX) });
  });
  return writing;
}

function preview(body: BodyInit | null | undefined): { bytes: number; text: string } {
  if (!body) return { bytes: 0, text: "" };
  if (typeof body === "string") return { bytes: new TextEncoder().encode(body).length, text: body.slice(0, 300) };
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return { bytes: body.byteLength, text: `[ciphertext · ${body.byteLength.toLocaleString()} bytes]` };
  if (body instanceof Blob) return { bytes: body.size, text: `[ciphertext · ${body.size.toLocaleString()} bytes]` };
  return { bytes: 0, text: "[body]" };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, absoluteUrl?: string): Promise<T> {
  const url = absoluteUrl ?? `${API_BASE}${path}`;
  const method = init.method ?? "GET";
  const p = preview(init.body);
  await record({ at: new Date().toISOString(), method, url, bytes: p.bytes, preview: p.text });
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (typeof init.body === "string" && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { ...init, method, headers, referrerPolicy: "no-referrer", credentials: "omit", cache: "no-store" });
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new ApiError(res.status, String((data as { error?: string })?.error ?? res.status));
  return data as T;
}

export const postJson = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });

export async function readLedger(): Promise<LedgerEntry[]> {
  return ((await browser.storage.local.get(LEDGER_KEY))[LEDGER_KEY] as LedgerEntry[] | undefined) ?? [];
}

export const clearLedger = () => browser.storage.local.set({ [LEDGER_KEY]: [] });

export function onLedger(fn: (entries: LedgerEntry[]) => void) {
  readLedger().then(fn);
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === "local" && changes[LEDGER_KEY]) fn((changes[LEDGER_KEY].newValue as LedgerEntry[]) ?? []);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function lookupTxt(name: string): Promise<string[]> {
  const url = `${DOH_URL}?name=${encodeURIComponent(name)}&type=TXT`;
  const body = await apiFetch<{ Answer?: { data: string }[] }>("", { headers: { accept: "application/dns-json" } }, url);
  return (body.Answer ?? []).map((a) => a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, ""));
}

export const safeHttpUrl = (url: string | undefined) => {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
};
