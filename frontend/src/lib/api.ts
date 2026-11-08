import { bs, type LedgerEntry } from "@oj/core";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api";
export const APP_URL = import.meta.env.VITE_APP_URL ?? window.location.origin;

type Listener = (entries: LedgerEntry[]) => void;
const entries: LedgerEntry[] = [];
const listeners = new Set<Listener>();

function describe(body: unknown): { bytes: number; preview: string } {
  if (!body) return { bytes: 0, preview: "" };
  if (typeof body === "string") return { bytes: new TextEncoder().encode(body).length, preview: body.slice(0, 280) };
  if (body instanceof Uint8Array) return { bytes: body.byteLength, preview: `[ciphertext · ${body.byteLength.toLocaleString()} bytes]` };
  return { bytes: 0, preview: "[binary]" };
}

function record(method: string, url: string, body: unknown) {
  const { bytes, preview } = describe(body);
  entries.unshift({ at: new Date().toISOString(), method, url, bytes, preview });
  if (entries.length > 200) entries.length = 200;
  listeners.forEach((fn) => fn(entries.slice()));
}

export const ledger = {
  subscribe(fn: Listener) {
    listeners.add(fn);
    fn(entries.slice());
    return () => {
      listeners.delete(fn);
    };
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public body: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit & { token?: string; json?: unknown } = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const method = init.method ?? (init.json !== undefined ? "POST" : "GET");
  record(method, url, body);
  const res = await fetch(url, { ...init, method, body, headers, referrerPolicy: "no-referrer", credentials: "omit" });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, String(data.error ?? res.status), data);
  return data as T;
}

export async function putBytes(url: string, bytes: Uint8Array) {
  record("PUT", url, bytes);
  const res = await fetch(url, {
    method: "PUT",
    body: bs(bytes),
    headers: { "Content-Type": "application/octet-stream" },
    referrerPolicy: "no-referrer",
    credentials: "omit",
  });
  if (!res.ok) throw new ApiError(res.status, "upload_failed");
}

export async function getBytes(url: string): Promise<Uint8Array> {
  record("GET", url, null);
  const res = await fetch(url, { referrerPolicy: "no-referrer", credentials: "omit" });
  if (!res.ok) throw new ApiError(res.status, "download_failed");
  return new Uint8Array(await res.arrayBuffer());
}

let serverKey: Promise<string> | null = null;

export const getServerKey = () => (serverKey ??= api<{ publicKey: string }>("/server-key").then((r) => r.publicKey));
