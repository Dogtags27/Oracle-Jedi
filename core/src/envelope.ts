import { ml_kem768_x25519 as xwing } from "@noble/post-quantum/hybrid.js";
import {
  SUITE,
  type EnvelopeHeader,
  type Meta,
  type OfficeKeyBundle,
  type OfficeSecret,
  type PersonKeyShares,
  type Sealed,
} from "./types";
import { bs, canonicalJson, concat, fromB64, fromUtf8, newId, randomBytes, sha256, toB64, utf8, xor } from "./encoding";
import { bundleFingerprint, keyId } from "./keys";

export const CHUNK_SIZE = 1024 * 1024;
const TAG = 16;
const SMALL_STEP = 64 * 1024;

export interface SealOptions {
  id?: string;
  ttlMinutes?: number;
}

export function paddedSizeFor(length: number): number {
  const step = length < CHUNK_SIZE ? SMALL_STEP : CHUNK_SIZE;
  return Math.max(step, Math.ceil(length / step) * step);
}

export const ciphertextSizeFor = (header: Pick<EnvelopeHeader, "paddedSize" | "nChunks">) =>
  header.paddedSize + header.nChunks * TAG;

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", bs(raw), "AES-GCM", false, ["encrypt", "decrypt"]);

async function kekFrom(sharedSecret: Uint8Array, id: string) {
  const base = await crypto.subtle.importKey("raw", bs(sharedSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: bs(utf8(id)), info: bs(utf8(`${SUITE}/kek`)) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function chunkNonce(base: Uint8Array, index: number): Uint8Array {
  const nonce = base.slice();
  const view = new DataView(nonce.buffer);
  view.setUint32(8, view.getUint32(8) ^ index);
  return nonce;
}

function chunkAad(headerHash: Uint8Array, index: number, final: boolean): Uint8Array {
  const aad = new Uint8Array(37);
  aad.set(headerHash, 0);
  new DataView(aad.buffer).setUint32(32, index);
  aad[36] = final ? 1 : 0;
  return aad;
}

export const headerHash = (header: EnvelopeHeader) => sha256(utf8(canonicalJson(header)));

function frame(data: Uint8Array, meta: Meta): Uint8Array {
  const metaBytes = utf8(JSON.stringify({ ...meta, size: data.length }));
  const out = new Uint8Array(paddedSizeFor(4 + metaBytes.length + data.length));
  new DataView(out.buffer).setUint32(0, metaBytes.length);
  out.set(metaBytes, 4);
  out.set(data, 4 + metaBytes.length);
  return out;
}

function unframe(payload: Uint8Array): { data: Uint8Array; meta: Meta } {
  const metaLength = new DataView(payload.buffer, payload.byteOffset).getUint32(0);
  const meta = JSON.parse(fromUtf8(payload.subarray(4, 4 + metaLength))) as Meta;
  return { meta, data: payload.slice(4 + metaLength, 4 + metaLength + meta.size) };
}

function baseHeader(id: string, mode: EnvelopeHeader["mode"], paddedSize: number, ttlMinutes: number): EnvelopeHeader {
  const now = new Date();
  return {
    v: 1,
    suite: SUITE,
    id,
    mode,
    chunkSize: CHUNK_SIZE,
    nChunks: Math.ceil(paddedSize / CHUNK_SIZE),
    nonceBase: toB64(randomBytes(12)),
    paddedSize,
    created: now.toISOString(),
    expires: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
  };
}

async function encryptPayload(payload: Uint8Array, dek: Uint8Array, header: EnvelopeHeader): Promise<Uint8Array> {
  const key = await aesKey(dek);
  const hh = await headerHash(header);
  const nonceBase = fromB64(header.nonceBase);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < header.nChunks; i++) {
    const chunk = payload.subarray(i * header.chunkSize, Math.min((i + 1) * header.chunkSize, payload.length));
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bs(chunkNonce(nonceBase, i)), additionalData: bs(chunkAad(hh, i, i === header.nChunks - 1)) },
      key,
      bs(chunk),
    );
    parts.push(new Uint8Array(sealed));
  }
  return concat(...parts);
}

async function decryptPayload(ciphertext: Uint8Array, dek: Uint8Array, header: EnvelopeHeader): Promise<Uint8Array> {
  if (header.suite !== SUITE) throw new Error("unsupported_suite");
  if (ciphertext.length !== ciphertextSizeFor(header)) throw new Error("truncated");
  const key = await aesKey(dek);
  const hh = await headerHash(header);
  const nonceBase = fromB64(header.nonceBase);
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < header.nChunks; i++) {
    const plainLength = Math.min(header.chunkSize, header.paddedSize - i * header.chunkSize);
    const chunk = ciphertext.subarray(offset, offset + plainLength + TAG);
    offset += plainLength + TAG;
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bs(chunkNonce(nonceBase, i)), additionalData: bs(chunkAad(hh, i, i === header.nChunks - 1)) },
      key,
      bs(chunk),
    );
    parts.push(new Uint8Array(opened));
  }
  return concat(...parts);
}

export async function sealToOffice(
  data: Uint8Array,
  meta: Meta,
  bundle: OfficeKeyBundle,
  options: SealOptions = {},
): Promise<Sealed> {
  const id = options.id ?? newId("ho");
  const payload = frame(data, meta);
  const dek = randomBytes(32);
  const { cipherText, sharedSecret } = xwing.encapsulate(fromB64(bundle.kemPk));
  const kek = await kekFrom(sharedSecret, id);
  const wrapNonce = randomBytes(12);
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(wrapNonce), additionalData: bs(utf8(id)) }, kek, bs(dek)),
  );
  const header: EnvelopeHeader = {
    ...baseHeader(id, "office", payload.length, options.ttlMinutes ?? 7 * 24 * 60),
    recipient: { domain: bundle.domain, kid: keyId(await bundleFingerprint(bundle)) },
    kemCt: toB64(cipherText),
    wrappedDek: toB64(wrappedDek),
    wrapNonce: toB64(wrapNonce),
  };
  return { header, ciphertext: await encryptPayload(payload, dek, header) };
}

export async function sealForPerson(
  data: Uint8Array,
  meta: Meta,
  options: SealOptions = {},
): Promise<Sealed & PersonKeyShares> {
  const id = options.id ?? newId("ho");
  const payload = frame(data, meta);
  const k1 = randomBytes(32);
  const k2 = randomBytes(32);
  const header = baseHeader(id, "person", payload.length, options.ttlMinutes ?? 7 * 24 * 60);
  return { header, ciphertext: await encryptPayload(payload, xor(k1, k2), header), k1, k2 };
}

async function dekFor(header: EnvelopeHeader, key: OfficeSecret | PersonKeyShares): Promise<Uint8Array> {
  if (header.mode === "person") {
    if (!("k1" in key)) throw new Error("person_keys_required");
    return xor(key.k1, key.k2);
  }
  if (!("kemSk" in key) || !header.kemCt || !header.wrappedDek || !header.wrapNonce) throw new Error("office_key_required");
  const sharedSecret = xwing.decapsulate(fromB64(header.kemCt), key.kemSk);
  const kek = await kekFrom(sharedSecret, header.id);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bs(fromB64(header.wrapNonce)), additionalData: bs(utf8(header.id)) },
      kek,
      bs(fromB64(header.wrappedDek)),
    ),
  );
}

export async function openSealed(
  sealed: Sealed,
  key: OfficeSecret | PersonKeyShares,
): Promise<{ data: Uint8Array; meta: Meta }> {
  const dek = await dekFor(sealed.header, key);
  return unframe(await decryptPayload(sealed.ciphertext, dek, sealed.header));
}
