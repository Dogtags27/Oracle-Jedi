export const utf8 = (text: string) => new TextEncoder().encode(text);
export const fromUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export const bs = (bytes: Uint8Array) => bytes as unknown as BufferSource;

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) throw new Error("length_mismatch");
  return a.map((byte, i) => byte ^ (b[i] ?? 0));
}

export function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromB64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const toB64Url = (bytes: Uint8Array) =>
  toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const fromB64Url = (text: string) =>
  fromB64(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));

export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const fromHex = (hex: string) =>
  new Uint8Array((hex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16)));

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bs(bytes)));
}

export const sha256Hex = async (input: Uint8Array | string) =>
  toHex(await sha256(typeof input === "string" ? utf8(input) : input));

export const newId = (prefix: string) => `${prefix}_${toB64Url(randomBytes(12))}`;

export const newSecretToken = () => toB64Url(randomBytes(32));

export const revokeTokenHash = (token: string) => sha256Hex(`oracle-jedi/revoke:${token}`);

export const pickupCodeHash = (handoffId: string, code: string) => sha256Hex(`${handoffId}:${code}`);

export function newPickupCode(): string {
  const n = new DataView(randomBytes(4).buffer).getUint32(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}
