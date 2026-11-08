import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { SUITE } from "@oj/core";
import { ensureBucket, schemaReady, db } from "./db";
import { configured, env } from "./env";
import { serverSigner } from "./security";
import { type AppEnv, type HandoffRow, expireIfNeeded } from "./shared";
import { handoffs } from "./routes/handoffs";
import { officeArea, offices, requests } from "./routes/offices";
import { check } from "./routes/check";
import { rateLimit } from "./ratelimit";

export const app = new Hono<AppEnv>().basePath("/api");

app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  console.log(`${c.req.method} ${c.req.routePath} ${c.res.status} ${Date.now() - started}ms`);
});

app.use("*", secureHeaders({ referrerPolicy: "no-referrer", crossOriginResourcePolicy: "cross-origin" }));

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (origin.startsWith("chrome-extension://")) return origin;
      return env.allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Revoke-Token"],
    maxAge: 600,
  }),
);

app.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});

app.get("/health", async (c) => {
  const ready = configured.supabaseUrl && configured.supabaseServiceRole;
  return c.json({
    ok: true,
    suite: SUITE,
    configured,
    schema: ready ? await schemaReady() : false,
    bucket: ready ? await ensureBucket() : false,
  });
});

app.get("/server-key", async (c) => c.json({ publicKey: (await serverSigner()).publicKey, alg: "ML-DSA-65" }));

app.use("/handoffs", rateLimit("handoff-create", 30));
app.use("/handoffs/:id/k2", rateLimit("pickup-code", 10));
app.use("/offices", rateLimit("office-register", 10));
app.use("/offices/:domain/session", rateLimit("office-login", 20));
app.use("/offices/:domain/verify", rateLimit("office-verify", 10));

app.route("/offices", offices);
app.route("/office", officeArea);
app.route("/requests", requests);
app.route("/handoffs", handoffs);
app.route("/check", check);

export async function purgeExpired() {
  const { data } = await db().from("handoffs").select("*").in("status", ["pending", "stored", "opened"]).lt("expires_at", new Date().toISOString()).limit(200);
  const rows = await Promise.all(((data ?? []) as HandoffRow[]).map(expireIfNeeded));
  return rows.length;
}

app.post("/cron/purge", async (c) => {
  if (!env.cronSecret || c.req.header("Authorization") !== `Bearer ${env.cronSecret}`) return c.json({ error: "unauthorized" }, 401);
  return c.json({ expired: await purgeExpired() });
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(`${c.req.method} ${c.req.routePath} failed: ${err.name}`);
  return c.json({ error: "internal_error" }, 500);
});
