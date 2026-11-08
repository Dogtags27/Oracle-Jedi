import {
  bs,
  fromB64,
  fromUtf8,
  generateOfficeKeys,
  loginMessage,
  newPickupCode,
  newSecretToken,
  openSealed,
  pickupCodeHash,
  revokeTokenHash,
  sealForPerson,
  sealToOffice,
  sha256Hex,
  signMessage,
  signObject,
  toB64,
  utf8,
  verifyBundle,
  verifyObject,
  type OfficeKeyBundle,
} from "@oj/core";

const API = process.env.API ?? "http://localhost:8787/api";
let step = 0;

function ok(label: string, condition: unknown) {
  step++;
  if (!condition) {
    console.error(`✗ ${step}. ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${step}. ${label}`);
}

async function call<T = any>(path: string, init: RequestInit = {}, expect = 200): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== expect) throw new Error(`${init.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}, expect = 200) =>
  call(path, { method: "POST", body: JSON.stringify(body), headers }, expect);

const SSN = "987-65-4321";
const doc = utf8(`W-2 Wage and Tax Statement 2025\nEmployee SSN ${SSN}\nWages 84,200.00\n`.repeat(400));

const health = await call("/health");
ok("backend healthy, schema + bucket ready", health.schema && health.bucket);

const office = generateOfficeKeys(`smoke-${Date.now()}.test`, "Smoke Street Tax");
const view = await post("/offices", office.bundle);
ok(`office registered with safety words: ${view.safetyWords.join(" ")}`, view.safetyWords.length === 6);

const ts = Date.now();
const { token } = await post(`/offices/${office.bundle.domain}/session`, {
  ts,
  sig: signMessage(loginMessage(office.bundle.domain, ts), office.secret.sigSk),
});
const auth = { Authorization: `Bearer ${token}` };
ok("passwordless ML-DSA login issued a session", token);

await post(`/offices/${office.bundle.domain}/session`, { ts, sig: signMessage("forged", office.secret.sigSk) }, {}, 401);
ok("forged login rejected", true);

const rq = await post("/office/requests", { checklist: ["W-2", "Photo ID"], expiresInMinutes: 60 }, auth);
const pub = await call(`/requests/${rq.id}`);
const bundleCheck = await verifyBundle(pub.office.bundle as OfficeKeyBundle);
ok("client fetched request + verified office bundle signature", bundleCheck.ok && bundleCheck.fingerprint === view.fingerprint);

const serverKey = (await call("/server-key")).publicKey as string;

const revoke = newSecretToken();
const created = await post("/handoffs", {
  mode: "office",
  officeDomain: office.bundle.domain,
  requestId: rq.id,
  revokeTokenHash: await revokeTokenHash(revoke),
});
const sealed = await sealToOffice(doc, { name: "w2-2025.pdf", type: "application/pdf", size: doc.length }, pub.office.bundle, { id: created.id });
ok("ciphertext contains no SSN and header hides the filename", !fromUtf8(sealed.ciphertext).includes(SSN) && !JSON.stringify(sealed.header).includes("w2-2025"));

const put = await fetch(created.uploadUrl, { method: "PUT", body: bs(sealed.ciphertext), headers: { "Content-Type": "application/octet-stream" } });
ok(`ciphertext uploaded straight to storage (${sealed.ciphertext.length} bytes)`, put.ok);

const receipt = await post(`/handoffs/${created.id}/finalize`, {
  header: sealed.header,
  ctSha256: await sha256Hex(sealed.ciphertext),
  paddedSize: sealed.header.paddedSize,
});
const { sig: receiptSig, ...receiptBody } = receipt;
ok("server issued an ML-DSA storage receipt that verifies", verifyObject(receiptBody, receiptSig, serverKey));

const inbox = await call("/office/handoffs", { headers: auth });
ok("office inbox lists the handoff", inbox.handoffs.some((h: any) => h.id === created.id && h.status === "stored"));

await call(`/handoffs/${created.id}`, {}, 403);
ok("handoff download refused without the office session", true);

const info = await call(`/handoffs/${created.id}`, { headers: auth });
const ct = new Uint8Array(await (await fetch(info.downloadUrl)).arrayBuffer());
const opened = await openSealed({ header: info.header, ciphertext: ct }, office.secret);
ok("office decrypted with X-Wing secret key, plaintext matches", fromUtf8(opened.data) === fromUtf8(doc) && opened.meta.name === "w2-2025.pdf");

const openedAt = new Date().toISOString();
await post(`/handoffs/${created.id}/opened`, { openedAt, sig: signObject({ id: created.id, openedAt, type: "opened" }, office.secret.sigSk) }, auth);
const status = await call(`/handoffs/${created.id}/status`, { headers: { "X-Revoke-Token": revoke } });
ok("sender sees 'opened' with the office's signed open receipt", status.status === "opened" && status.openReceipt?.sig);

await call(`/handoffs/${created.id}`, { method: "DELETE", headers: { "X-Revoke-Token": "wrong" } }, 404);
const revoked = await call(`/handoffs/${created.id}`, { method: "DELETE", headers: { "X-Revoke-Token": revoke } });
await call(`/handoffs/${created.id}`, { headers: auth }, 410);
ok("revoke needs the sender's token; afterwards the handoff is gone (410)", revoked.status === "revoked");

const code = newPickupCode();
const revoke2 = newSecretToken();
const p = await post("/handoffs", { mode: "person", revokeTokenHash: await revokeTokenHash(revoke2), expiresInMinutes: 5 });
const ps = await sealForPerson(doc, { name: "id.png", type: "image/png", size: doc.length }, { id: p.id, ttlMinutes: 5 });
await fetch(p.uploadUrl, { method: "PUT", body: bs(ps.ciphertext), headers: { "Content-Type": "application/octet-stream" } });
await post(`/handoffs/${p.id}/finalize`, {
  header: ps.header,
  ctSha256: await sha256Hex(ps.ciphertext),
  paddedSize: ps.header.paddedSize,
  k2: toB64(ps.k2),
  codeHash: await pickupCodeHash(p.id, code),
});
const pinfo = await call(`/handoffs/${p.id}`);
const pct = new Uint8Array(await (await fetch(pinfo.downloadUrl)).arrayBuffer());
const wrong = await post(`/handoffs/${p.id}/k2`, { code: code === "000000" ? "111111" : "000000" }, {}, 401);
const { k2 } = await post(`/handoffs/${p.id}/k2`, { code });
const popened = await openSealed({ header: pinfo.header, ciphertext: pct }, { k1: ps.k1, k2: fromB64(k2) });
ok(`person mode: wrong code rejected (${wrong.attemptsLeft} left), right code + link half decrypts`, fromUtf8(popened.data) === fromUtf8(doc));

console.log(`\nAll ${step} checks passed · HANDOFF-PQ1 end to end`);
