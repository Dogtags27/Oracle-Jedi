import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import type { OfficeKeyBundle, OfficeSecret } from "./types";
import { canonicalJson, fromB64, fromHex, sha256Hex, toB64, utf8 } from "./encoding";
import { WORDS } from "./words";

export interface OfficeKeys {
  bundle: OfficeKeyBundle;
  secret: OfficeSecret;
}

export interface BundleCheck {
  ok: boolean;
  fingerprint: string;
  reason?: "bad_signature" | "expired" | "dns_mismatch";
}

export const normalizeDomain = (domain: string) =>
  domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "");

export function unsignedBundle(bundle: OfficeKeyBundle): Omit<OfficeKeyBundle, "sig"> {
  const { sig: _sig, ...rest } = bundle;
  return rest;
}

export const bundleFingerprint = (bundle: OfficeKeyBundle) =>
  sha256Hex(canonicalJson(unsignedBundle(bundle)));

export const keyId = (fingerprint: string) => fingerprint.slice(0, 16);

export function safetyWords(fingerprint: string, count = 6): string[] {
  return Array.from(fromHex(fingerprint).subarray(0, count), (byte): string => WORDS[byte] ?? "?");
}

export const dnsRecordName = (domain: string) => `_handoff.${normalizeDomain(domain)}`;
export const dnsRecordValue = (fingerprint: string) => `v=HO1; fp=${fingerprint}`;

export function generateOfficeKeys(domain: string, name: string, validDays = 365): OfficeKeys {
  const kem = xwing.keygen();
  const sig = ml_dsa65.keygen();
  const now = new Date();
  const body: Omit<OfficeKeyBundle, "sig"> = {
    v: 1,
    domain: normalizeDomain(domain),
    name: name.trim(),
    kemPk: toB64(kem.publicKey),
    sigPk: toB64(sig.publicKey),
    created: now.toISOString(),
    expires: new Date(now.getTime() + validDays * 86_400_000).toISOString(),
  };
  const signature = ml_dsa65.sign(utf8(canonicalJson(body)), sig.secretKey);
  return {
    bundle: { ...body, sig: toB64(signature) },
    secret: { kemSk: kem.secretKey, sigSk: sig.secretKey },
  };
}

export async function verifyBundle(
  bundle: OfficeKeyBundle,
  options: { dnsFingerprint?: string; now?: Date } = {},
): Promise<BundleCheck> {
  const fingerprint = await bundleFingerprint(bundle);
  let valid = false;
  try {
    valid = ml_dsa65.verify(fromB64(bundle.sig), utf8(canonicalJson(unsignedBundle(bundle))), fromB64(bundle.sigPk));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, fingerprint, reason: "bad_signature" };
  if (new Date(bundle.expires) < (options.now ?? new Date())) return { ok: false, fingerprint, reason: "expired" };
  if (options.dnsFingerprint && options.dnsFingerprint !== fingerprint) {
    return { ok: false, fingerprint, reason: "dns_mismatch" };
  }
  return { ok: true, fingerprint };
}

export const signMessage = (message: string, secretKey: Uint8Array) =>
  toB64(ml_dsa65.sign(utf8(message), secretKey));

export function verifyMessage(signature: string, message: string, publicKey: string): boolean {
  try {
    return ml_dsa65.verify(fromB64(signature), utf8(message), fromB64(publicKey));
  } catch {
    return false;
  }
}

export const signObject = (value: unknown, secretKey: Uint8Array) => signMessage(canonicalJson(value), secretKey);

export const verifyObject = (value: unknown, signature: string, publicKey: string) =>
  verifyMessage(signature, canonicalJson(value), publicKey);

export function signerFromSeed(seed: Uint8Array) {
  const { publicKey, secretKey } = ml_dsa65.keygen(seed.subarray(0, 32));
  return { publicKey: toB64(publicKey), secretKey };
}

export const loginMessage = (domain: string, timestamp: number) =>
  `oracle-jedi-login:${normalizeDomain(domain)}:${timestamp}`;
