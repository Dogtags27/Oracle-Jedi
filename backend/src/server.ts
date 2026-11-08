import { serve } from "@hono/node-server";
import { app, purgeExpired } from "./app";
import { configured, env } from "./env";

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Avaran backend on http://localhost:${info.port}/api`);
});

if (configured.supabaseUrl && configured.supabaseServiceRole) {
  setInterval(() => {
    purgeExpired().catch(() => {});
  }, 60_000).unref();
}
