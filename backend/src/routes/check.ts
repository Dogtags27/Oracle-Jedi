import { Hono } from "hono";
import { z } from "zod";
import type { CheckRequest } from "@oj/core";
import { runCheck } from "../check/engine";
import { type AppEnv, parseBody } from "../shared";

const hits = new Map<string, number[]>();

function limited(ip: string, perMinute = 20) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > perMinute;
}

export const check = new Hono<AppEnv>();

check.post("/", async (c) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return c.json({ error: "rate_limited" }, 429);
  const input = await parseBody(
    c,
    z.object({
      claimedOrg: z.string().min(2).max(120),
      senderDomain: z.string().max(253).default(""),
      senderEmail: z.string().max(254).optional(),
      linkDomains: z.array(z.string().max(253)).max(10).default([]),
      phones: z.array(z.string().max(32)).max(5).default([]),
      locationHint: z.string().max(80).optional(),
    }),
  );
  return c.json(await runCheck(input as CheckRequest));
});
