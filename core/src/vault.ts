import { argon2id } from "hash-wasm";
import type { OfficeKeyBundle } from "./types";
import { bs, fromB64, fromUtf8, randomBytes, toB64, utf8 } from "./encoding";
import { bundleFingerprint, type OfficeKeys } from "./keys";

export interface KeyKit {
  v: 1;
  kdf: "argon2id";
  salt: string;
  m: number;
  t: number;
  p: number;
  nonce: string;
  ct: string;
  bundle: OfficeKeyBundle;
}

export interface KdfParams {
  m: number;
  t: number;
  p: number;
}

export const DEFAULT_KDF: KdfParams = { m: 65536, t: 3, p: 1 };

async function deriveKey(passphrase: string, salt: Uint8Array, params: KdfParams) {
  const raw = await argon2id({
    password: passphrase,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: 32,
    outputType: "binary",
  });
  return crypto.subtle.importKey("raw", bs(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function lockKeys(keys: OfficeKeys, passphrase: string, params: KdfParams = DEFAULT_KDF): Promise<KeyKit> {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const key = await deriveKey(passphrase, salt, params);
  const aad = utf8(await bundleFingerprint(keys.bundle));
  const secret = utf8(JSON.stringify({ kemSk: toB64(keys.secret.kemSk), sigSk: toB64(keys.secret.sigSk) }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(nonce), additionalData: bs(aad) }, key, bs(secret)));
  return { v: 1, kdf: "argon2id", salt: toB64(salt), ...params, nonce: toB64(nonce), ct: toB64(ct), bundle: keys.bundle };
}

export async function unlockKeys(kit: KeyKit, passphrase: string): Promise<OfficeKeys> {
  const key = await deriveKey(passphrase, fromB64(kit.salt), kit);
  const aad = utf8(await bundleFingerprint(kit.bundle));
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bs(fromB64(kit.nonce)), additionalData: bs(aad) },
      key,
      bs(fromB64(kit.ct)),
    );
  } catch {
    throw new Error("wrong_passphrase");
  }
  const secret = JSON.parse(fromUtf8(new Uint8Array(plain))) as { kemSk: string; sigSk: string };
  return { bundle: kit.bundle, secret: { kemSk: fromB64(secret.kemSk), sigSk: fromB64(secret.sigSk) } };
}
