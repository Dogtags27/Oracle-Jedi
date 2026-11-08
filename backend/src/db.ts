import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new Error("supabase_not_configured");
  client ??= createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const bucket = () => db().storage.from(env.bucket);

export async function schemaReady(): Promise<boolean> {
  try {
    const results = await Promise.all(
      ["offices", "requests", "handoffs", "handoff_events", "check_cache"].map((t) => db().from(t).select("*").limit(1)),
    );
    return results.every((r) => !r.error);
  } catch {
    return false;
  }
}

export async function ensureBucket(): Promise<boolean> {
  try {
    const { data } = await db().storage.getBucket(env.bucket);
    if (data) return true;
    const { error } = await db().storage.createBucket(env.bucket, { public: false });
    return !error;
  } catch {
    return false;
  }
}
