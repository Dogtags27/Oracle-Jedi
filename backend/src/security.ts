import {
  bs,
  canonicalJson,
  fromB64Url,
  normalizeDomain,
  randomBytes,
  revokeTokenHash,
  sha256,
  sha256Hex,
  signObject,
  signerFromSeed,
  toB64Url,
  utf8,
} from "@oj/core";
import { db } from "./db";
import { env } from "./env";

const secretMaterial = env.serverSecret || toB64Url(randomBytes(32));

let signerCache: Awaited<ReturnType<typeof makeSigner>> | null = null;

async function makeSigner() {
  const seed = await sha256(utf8(`oracle-jedi/server-mldsa/v1:${secretMaterial}`));
  return signerFromSeed(seed);
}

export async function serverSigner() {
  signerCache ??= await makeSigner();
  return signerCache;
}

export async function serverSign(value: unknown) {
  const signer = await serverSigner();
  return signObject(value, signer.secretKey);
}

let hmacKey: CryptoKey | null = null;

async function sessionKey() {
  hmacKey ??= await crypto.subtle.importKey(
    "raw",
    bs(await sha256(utf8(`oracle-jedi/session/v1:${secretMaterial}`))),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return hmacKey;
}

export async function issueSession(domain: string, ttlHours = 12) {
  const payload = toB64Url(utf8(JSON.stringify({ d: normalizeDomain(domain), exp: Date.now() + ttlHours * 3_600_000 })));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(), bs(utf8(payload))));
  return `${payload}.${toB64Url(mac)}`;
}

export async function readSession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, mac] = token.replace(/^Bearer\s+/i, "").split(".");
  if (!payload || !mac) return null;
  const ok = await crypto.subtle.verify("HMAC", await sessionKey(), bs(fromB64Url(mac)), bs(utf8(payload)));
  if (!ok) return null;
  const data = JSON.parse(new TextDecoder().decode(fromB64Url(payload))) as { d: string; exp: number };
  return data.exp > Date.now() ? data.d : null;
}

export const hashToken = (token: string) => revokeTokenHash(token);

export async function lookupTxt(name: string): Promise<string[]> {
  const url = `${env.dohResolverUrl}?name=${encodeURIComponent(name)}&type=TXT`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) return [];
  const body = (await res.json()) as { Answer?: { data: string }[] };
  return (body.Answer ?? []).map((a) => a.data.replace(/"\s*"/g, "").replace(/^"|"$/g, ""));
}

export async function logEvent(handoffId: string, officeDomain: string | null, type: string) {
  const { data } = await db()
    .from("handoff_events")
    .select("hash")
    .eq("handoff_id", handoffId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevHash = data?.hash ?? "GENESIS";
  const at = new Date().toISOString();
  const hash = await sha256Hex(prevHash + canonicalJson({ handoffId, type, at }));
  await db().from("handoff_events").insert({ handoff_id: handoffId, office_domain: officeDomain, type, at, prev_hash: prevHash, hash });
}
