import { Hono } from "hono";
import { z } from "zod";
import { loginMessage, newId, normalizeDomain, verifyBundle, verifyMessage, type OfficeKeyBundle } from "@oj/core";
import { db } from "../db";
import { issueSession, lookupTxt } from "../security";
import {
  type AppEnv,
  type HandoffRow,
  expireIfNeeded,
  getOffice,
  handoffSummary,
  officeView,
  parseBody,
  requireOffice,
} from "../shared";

const bundleSchema = z.object({
  v: z.literal(1),
  domain: z.string().min(3).max(253),
  name: z.string().min(1).max(120),
  kemPk: z.string().min(100),
  sigPk: z.string().min(100),
  created: z.string(),
  expires: z.string(),
  prevFp: z.string().optional(),
  sig: z.string().min(100),
});

export const offices = new Hono<AppEnv>();

offices.post("/", async (c) => {
  const bundle = (await parseBody(c, bundleSchema)) as OfficeKeyBundle;
  const check = await verifyBundle(bundle);
  if (!check.ok) return c.json({ error: check.reason }, 400);
  const existing = await getOffice(bundle.domain);
  if (existing?.dns_verified_at && existing.fingerprint !== check.fingerprint) {
    return c.json({ error: "office_locked" }, 409);
  }
  const row = {
    domain: bundle.domain,
    name: bundle.name,
    bundle,
    fingerprint: check.fingerprint,
    dns_verified_at: existing?.fingerprint === check.fingerprint ? existing.dns_verified_at : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db().from("offices").upsert(row);
  if (error) return c.json({ error: "store_failed" }, 500);
  return c.json(officeView(row));
});

offices.get("/:domain", async (c) => {
  const office = await getOffice(normalizeDomain(c.req.param("domain")));
  return office ? c.json(officeView(office)) : c.json({ error: "not_found" }, 404);
});

offices.post("/:domain/verify", async (c) => {
  const office = await getOffice(normalizeDomain(c.req.param("domain")));
  if (!office) return c.json({ error: "not_found" }, 404);
  const records = await lookupTxt(`_handoff.${office.domain}`);
  const match = records.some((r) => r.includes(`fp=${office.fingerprint}`));
  if (match && !office.dns_verified_at) {
    const verifiedAt = new Date().toISOString();
    await db().from("offices").update({ dns_verified_at: verifiedAt }).eq("domain", office.domain);
    office.dns_verified_at = verifiedAt;
  }
  return c.json({ ...officeView(office), dnsFound: records.length > 0, dnsMatch: match });
});

offices.post("/:domain/session", async (c) => {
  const { ts, sig } = await parseBody(c, z.object({ ts: z.number(), sig: z.string() }));
  const office = await getOffice(normalizeDomain(c.req.param("domain")));
  if (!office) return c.json({ error: "not_found" }, 404);
  if (Math.abs(Date.now() - ts) > 120_000) return c.json({ error: "stale" }, 400);
  if (!verifyMessage(sig, loginMessage(office.domain, ts), office.bundle.sigPk)) {
    return c.json({ error: "bad_signature" }, 401);
  }
  return c.json({ token: await issueSession(office.domain), office: officeView(office) });
});

export const officeArea = new Hono<AppEnv>();

officeArea.use("*", requireOffice);

officeArea.get("/me", async (c) => {
  const office = await getOffice(c.get("officeDomain"));
  return office ? c.json(officeView(office)) : c.json({ error: "not_found" }, 404);
});

officeArea.get("/handoffs", async (c) => {
  const { data } = await db()
    .from("handoffs")
    .select("*")
    .eq("office_domain", c.get("officeDomain"))
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = await Promise.all(((data ?? []) as HandoffRow[]).map(expireIfNeeded));
  return c.json({ handoffs: rows.map(handoffSummary) });
});

officeArea.post("/requests", async (c) => {
  const input = await parseBody(
    c,
    z.object({
      checklist: z.array(z.string().min(1).max(60)).min(1).max(12),
      note: z.string().max(280).optional(),
      expiresInMinutes: z.number().int().min(1).max(60 * 24 * 60).optional(),
    }),
  );
  const row = {
    id: newId("rq"),
    office_domain: c.get("officeDomain"),
    checklist: input.checklist,
    note: input.note ?? null,
    expires_at: new Date(Date.now() + (input.expiresInMinutes ?? 30 * 24 * 60) * 60_000).toISOString(),
  };
  const { error } = await db().from("requests").insert(row);
  if (error) return c.json({ error: "store_failed" }, 500);
  return c.json({ id: row.id, checklist: row.checklist, note: row.note, expiresAt: row.expires_at });
});

officeArea.get("/requests", async (c) => {
  const { data } = await db()
    .from("requests")
    .select("id, checklist, note, expires_at, created_at")
    .eq("office_domain", c.get("officeDomain"))
    .order("created_at", { ascending: false })
    .limit(50);
  return c.json({
    requests: (data ?? []).map((r) => ({ id: r.id, checklist: r.checklist, note: r.note, expiresAt: r.expires_at, createdAt: r.created_at })),
  });
});

export const requests = new Hono<AppEnv>();

requests.get("/:id", async (c) => {
  const { data } = await db().from("requests").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (!data) return c.json({ error: "not_found" }, 404);
  if (new Date(data.expires_at) < new Date()) return c.json({ error: "expired" }, 410);
  const office = await getOffice(data.office_domain);
  if (!office) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: data.id,
    checklist: data.checklist,
    note: data.note,
    expiresAt: data.expires_at,
    office: officeView(office),
  });
});
