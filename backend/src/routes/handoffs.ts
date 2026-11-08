import { Hono } from "hono";
import { z } from "zod";
import { SUITE, ciphertextSizeFor, newId, normalizeDomain, pickupCodeHash, sha256Hex, verifyObject, type EnvelopeHeader } from "@oj/core";
import { bucket, db } from "../db";
import { hashToken, logEvent, readSession, serverSign } from "../security";
import { type AppEnv, expireIfNeeded, getHandoff, getOffice, handoffSummary, parseBody, requireOffice } from "../shared";

export const handoffs = new Hono<AppEnv>();

const DAY = 24 * 60;

handoffs.post("/", async (c) => {
  const input = await parseBody(
    c,
    z.object({
      mode: z.enum(["office", "person"]),
      officeDomain: z.string().optional(),
      requestId: z.string().optional(),
      revokeTokenHash: z.string().length(64),
      expiresInMinutes: z.number().int().min(1).max(30 * DAY).optional(),
    }),
  );
  let officeDomain: string | null = null;
  if (input.mode === "office") {
    if (!input.officeDomain) return c.json({ error: "office_required" }, 400);
    const office = await getOffice(normalizeDomain(input.officeDomain));
    if (!office) return c.json({ error: "unknown_office" }, 404);
    officeDomain = office.domain;
  }
  if (input.requestId) {
    const { data } = await db().from("requests").select("office_domain, expires_at").eq("id", input.requestId).maybeSingle();
    if (!data || data.office_domain !== officeDomain || new Date(data.expires_at) < new Date()) {
      return c.json({ error: "bad_request_link" }, 400);
    }
  }
  const id = newId("ho");
  const path = `${id}.bin`;
  const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 7 * DAY) * 60_000).toISOString();
  const { data: upload, error: uploadError } = await bucket().createSignedUploadUrl(path);
  if (uploadError || !upload) return c.json({ error: "storage_unavailable" }, 503);
  const { error } = await db().from("handoffs").insert({
    id,
    office_domain: officeDomain,
    request_id: input.requestId ?? null,
    mode: input.mode,
    storage_path: path,
    revoke_token_hash: input.revokeTokenHash,
    expires_at: expiresAt,
  });
  if (error) return c.json({ error: "store_failed" }, 500);
  await logEvent(id, officeDomain, "created");
  return c.json({ id, uploadUrl: upload.signedUrl, expiresAt });
});

handoffs.post("/:id/finalize", async (c) => {
  const input = await parseBody(
    c,
    z.object({
      header: z.record(z.string(), z.unknown()),
      ctSha256: z.string().length(64),
      paddedSize: z.number().int().positive(),
      k2: z.string().optional(),
      codeHash: z.string().length(64).optional(),
    }),
  );
  const row = await getHandoff(c.req.param("id"));
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status !== "pending") return c.json({ error: "already_finalized" }, 409);
  const header = input.header as unknown as EnvelopeHeader;
  if (header.id !== row.id || header.mode !== row.mode || header.suite !== SUITE || header.paddedSize !== input.paddedSize) {
    return c.json({ error: "header_mismatch" }, 400);
  }
  if (row.mode === "office" && header.recipient?.domain !== row.office_domain) return c.json({ error: "recipient_mismatch" }, 400);
  if (row.mode === "person" && (!input.k2 || !input.codeHash)) return c.json({ error: "person_keys_required" }, 400);
  const { data: blob, error } = await bucket().download(row.storage_path);
  if (error || !blob) return c.json({ error: "upload_missing" }, 400);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length !== ciphertextSizeFor(header) || (await sha256Hex(bytes)) !== input.ctSha256) {
    await bucket().remove([row.storage_path]);
    return c.json({ error: "ciphertext_mismatch" }, 400);
  }
  const storedAt = new Date().toISOString();
  const body = { id: row.id, ctSha256: input.ctSha256, paddedSize: input.paddedSize, storedAt };
  const receipt = { ...body, sig: await serverSign(body) };
  await db()
    .from("handoffs")
    .update({
      status: "stored",
      header,
      ct_sha256: input.ctSha256,
      padded_size: input.paddedSize,
      k2: input.k2 ?? null,
      code_hash: input.codeHash ?? null,
      receipt,
      stored_at: storedAt,
    })
    .eq("id", row.id);
  await logEvent(row.id, row.office_domain, "stored");
  return c.json(receipt);
});

handoffs.get("/:id", async (c) => {
  const found = await getHandoff(c.req.param("id"));
  if (!found || found.status === "pending") return c.json({ error: "not_found" }, 404);
  const row = await expireIfNeeded(found);
  if (row.status === "revoked" || row.status === "expired") return c.json({ error: row.status, status: row.status }, 410);
  if (row.mode === "office") {
    const domain = await readSession(c.req.header("Authorization"));
    if (domain !== row.office_domain) return c.json({ error: "forbidden" }, 403);
  }
  const { data } = await bucket().createSignedUrl(row.storage_path, 120);
  return c.json({ ...handoffSummary(row), header: row.header, receipt: row.receipt, downloadUrl: data?.signedUrl });
});

handoffs.post("/:id/opened", requireOffice, async (c) => {
  const { openedAt, sig } = await parseBody(c, z.object({ openedAt: z.string(), sig: z.string() }));
  const row = await getHandoff(c.req.param("id"));
  if (!row || row.office_domain !== c.get("officeDomain")) return c.json({ error: "not_found" }, 404);
  const office = await getOffice(row.office_domain);
  if (!office || !verifyObject({ id: row.id, openedAt, type: "opened" }, sig, office.bundle.sigPk)) {
    return c.json({ error: "bad_signature" }, 400);
  }
  if (row.status === "stored") {
    await db()
      .from("handoffs")
      .update({ status: "opened", opened_at: openedAt, open_receipt: { id: row.id, openedAt, type: "opened", sig } })
      .eq("id", row.id);
    await logEvent(row.id, row.office_domain, "opened");
  }
  return c.json({ ok: true });
});

handoffs.post("/:id/k2", async (c) => {
  const { code } = await parseBody(c, z.object({ code: z.string().min(4).max(32) }));
  const found = await getHandoff(c.req.param("id"));
  if (!found || found.mode !== "person" || found.status === "pending") return c.json({ error: "not_found" }, 404);
  const row = await expireIfNeeded(found);
  if (row.status === "revoked" || row.status === "expired" || !row.k2) return c.json({ error: "gone" }, 410);
  if ((await pickupCodeHash(row.id, code)) !== row.code_hash) {
    const attempts = row.attempts + 1;
    const burned = attempts >= 5;
    await db()
      .from("handoffs")
      .update(burned ? { attempts, k2: null, status: "revoked", revoked_at: new Date().toISOString() } : { attempts })
      .eq("id", row.id);
    if (burned) {
      await bucket().remove([row.storage_path]);
      await logEvent(row.id, null, "revoked");
    }
    return c.json({ error: burned ? "burned" : "wrong_code", attemptsLeft: Math.max(0, 5 - attempts) }, burned ? 410 : 401);
  }
  if (row.status === "stored") {
    await db().from("handoffs").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", row.id);
    await logEvent(row.id, null, "opened");
  }
  return c.json({ k2: row.k2 });
});

async function withRevokeToken(id: string, token: string | undefined) {
  const row = await getHandoff(id);
  if (!row || !token || (await hashToken(token)) !== row.revoke_token_hash) return null;
  return expireIfNeeded(row);
}

handoffs.get("/:id/status", async (c) => {
  const row = await withRevokeToken(c.req.param("id"), c.req.header("X-Revoke-Token"));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ...handoffSummary(row), openReceipt: row.open_receipt, receipt: row.receipt });
});

handoffs.delete("/:id", async (c) => {
  const row = await withRevokeToken(c.req.param("id"), c.req.header("X-Revoke-Token"));
  if (!row) return c.json({ error: "not_found" }, 404);
  if (row.status === "revoked" || row.status === "expired") return c.json(handoffSummary(row));
  await bucket().remove([row.storage_path]);
  const revokedAt = new Date().toISOString();
  await db().from("handoffs").update({ status: "revoked", revoked_at: revokedAt, k2: null }).eq("id", row.id);
  await logEvent(row.id, row.office_domain, "revoked");
  return c.json(handoffSummary({ ...row, status: "revoked", revoked_at: revokedAt, k2: null }));
});
