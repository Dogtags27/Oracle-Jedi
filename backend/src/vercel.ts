import type { IncomingMessage, ServerResponse } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { app, purgeExpired } from "./app";
import { configured } from "./env";

const listener = getRequestListener(app.fetch);
let lastPurge = 0;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  let purge: Promise<unknown> | null = null;
  if (configured.supabaseUrl && configured.supabaseServiceRole && now - lastPurge > 60_000) {
    lastPurge = now;
    purge = purgeExpired().catch(() => 0);
  }
  await listener(req, res);
  if (purge) await purge;
}
