import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { dnsRecordName, dnsRecordValue, safetyWords, type OfficeKeyBundle } from "@oj/core";
import { bucket, db } from "./db";
import { logEvent, readSession } from "./security";

export type AppEnv = { Variables: { officeDomain: string } };

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  const raw = await c.req.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: "invalid_body" });
  return parsed.data;
}

export const requireOffice: MiddlewareHandler<AppEnv> = async (c, next) => {
  const domain = await readSession(c.req.header("Authorization"));
  if (!domain) return c.json({ error: "unauthorized" }, 401);
  c.set("officeDomain", domain);
  await next();
};

export interface OfficeRow {
  domain: string;
  name: string;
  bundle: OfficeKeyBundle;
  fingerprint: string;
  dns_verified_at: string | null;
}

export function officeView(row: OfficeRow) {
  return {
    domain: row.domain,
    name: row.name,
    bundle: row.bundle,
    fingerprint: row.fingerprint,
    safetyWords: safetyWords(row.fingerprint),
    verified: Boolean(row.dns_verified_at),
    verifiedAt: row.dns_verified_at,
    dnsRecord: { name: dnsRecordName(row.domain), value: dnsRecordValue(row.fingerprint) },
  };
}

export async function getOffice(domain: string): Promise<OfficeRow | null> {
  const { data } = await db().from("offices").select("*").eq("domain", domain).maybeSingle();
  return (data as OfficeRow | null) ?? null;
}

export interface HandoffRow {
  id: string;
  office_domain: string | null;
  request_id: string | null;
  mode: "office" | "person";
  status: "pending" | "stored" | "opened" | "revoked" | "expired";
  header: Record<string, unknown> | null;
  ct_sha256: string | null;
  padded_size: number | null;
  storage_path: string;
  revoke_token_hash: string;
  k2: string | null;
  code_hash: string | null;
  attempts: number;
  receipt: Record<string, unknown> | null;
  open_receipt: Record<string, unknown> | null;
  created_at: string;
  stored_at: string | null;
  opened_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

export async function getHandoff(id: string): Promise<HandoffRow | null> {
  const { data } = await db().from("handoffs").select("*").eq("id", id).maybeSingle();
  return (data as HandoffRow | null) ?? null;
}

const LIVE = new Set(["pending", "stored", "opened"]);

export async function expireIfNeeded(row: HandoffRow): Promise<HandoffRow> {
  if (!LIVE.has(row.status) || new Date(row.expires_at) > new Date()) return row;
  await bucket().remove([row.storage_path]);
  const patch = { status: "expired" as const, k2: null };
  await db().from("handoffs").update(patch).eq("id", row.id);
  await logEvent(row.id, row.office_domain, "expired");
  return { ...row, ...patch };
}

export function handoffSummary(row: HandoffRow) {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    requestId: row.request_id,
    officeDomain: row.office_domain,
    paddedSize: row.padded_size,
    createdAt: row.created_at,
    storedAt: row.stored_at,
    openedAt: row.opened_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
  };
}
