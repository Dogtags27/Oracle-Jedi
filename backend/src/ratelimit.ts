import type { MiddlewareHandler } from "hono";

const buckets = new Map<string, number[]>();

export const clientIp = (forwarded: string | undefined) => forwarded?.split(",")[0]?.trim() || "local";

export function hit(key: string, perMinute: number) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 20_000) {
    for (const [k, times] of buckets) if (!times.some((t) => now - t < 60_000)) buckets.delete(k);
  }
  return recent.length > perMinute;
}

export const rateLimit =
  (name: string, perMinute: number): MiddlewareHandler =>
  async (c, next) => {
    if (hit(`${name}:${clientIp(c.req.header("x-forwarded-for"))}`, perMinute)) return c.json({ error: "rate_limited" }, 429);
    await next();
  };
