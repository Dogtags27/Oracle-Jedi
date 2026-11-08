import type { LedgerEntry } from "@oj/core";

const BASE = import.meta.env.WXT_API_BASE_URL ?? "http://localhost:8787/api";
const LEDGER_KEY = "ledger";
const LEDGER_MAX = 200;

async function record(entry: LedgerEntry) {
  const current = (await browser.storage.local.get(LEDGER_KEY))[LEDGER_KEY] as LedgerEntry[] | undefined;
  const next = [entry, ...(current ?? [])].slice(0, LEDGER_MAX);
  await browser.storage.local.set({ [LEDGER_KEY]: next });
}

function preview(body: BodyInit | null | undefined): { bytes: number; text: string } {
  if (!body) return { bytes: 0, text: "" };
  if (typeof body === "string") return { bytes: new TextEncoder().encode(body).length, text: body.slice(0, 300) };
  if (body instanceof Uint8Array) return { bytes: body.byteLength, text: `[encrypted bytes · ${body.byteLength}]` };
  if (body instanceof ArrayBuffer) return { bytes: body.byteLength, text: `[encrypted bytes · ${body.byteLength}]` };
  if (body instanceof Blob) return { bytes: body.size, text: `[encrypted blob · ${body.size}]` };
  return { bytes: 0, text: "[body]" };
}

export async function apiFetch<T>(path: string, init?: RequestInit, absoluteUrl?: string): Promise<T> {
  const url = absoluteUrl ?? `${BASE}${path}`;
  const method = init?.method ?? "GET";
  const p = preview(init?.body);
  await record({ at: new Date().toISOString(), method, url, bytes: p.bytes, preview: p.text });
  const res = await fetch(url, {
    ...init,
    referrerPolicy: "no-referrer",
    credentials: "omit",
    headers: init?.body instanceof Blob || init?.body instanceof Uint8Array
      ? init?.headers
      : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export async function readLedger(): Promise<LedgerEntry[]> {
  return ((await browser.storage.local.get(LEDGER_KEY))[LEDGER_KEY] as LedgerEntry[] | undefined) ?? [];
}
