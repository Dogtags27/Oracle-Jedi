import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

for (const relative of ["../../.env", "../.env"]) {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

const pick = (...names: string[]) => names.map((n) => process.env[n]).find((v) => v && v.trim())?.trim() ?? "";

const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const env = {
  port: Number(pick("PORT") || 8787),
  allowedOrigins: list(pick("ALLOWED_ORIGINS") || "http://localhost:5173"),
  publicAppUrl: pick("PUBLIC_APP_URL", "VITE_APP_URL") || "http://localhost:5173",
  supabaseUrl: pick("SUPABASE_URL", "VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: pick("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"),
  supabaseAnonKey: pick("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  tavilyApiKey: pick("TAVILY_API_KEY", "TAVILY_KEY"),
  exaApiKey: pick("EXA_API_KEY", "EXA_KEY"),
  serverSecret: pick("SERVER_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY"),
  cronSecret: pick("CRON_SECRET"),
  demoOfficeDomain: pick("DEMO_OFFICE_DOMAIN"),
  dohResolverUrl: pick("DOH_RESOLVER_URL") || "https://cloudflare-dns.com/dns-query",
  checkTimeoutMs: Number(pick("CHECK_TIMEOUT_MS") || 8000),
  checkCacheTtlHours: Number(pick("CHECK_CACHE_TTL_HOURS") || 24),
  bucket: pick("STORAGE_BUCKET") || "ciphertext",
};

export const configured = {
  supabaseUrl: Boolean(env.supabaseUrl),
  supabaseServiceRole: Boolean(env.supabaseServiceRoleKey),
  supabaseAnon: Boolean(env.supabaseAnonKey),
  tavily: Boolean(env.tavilyApiKey),
  exa: Boolean(env.exaApiKey),
  serverSecret: Boolean(env.serverSecret),
};
