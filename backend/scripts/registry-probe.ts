import { generateOfficeKeys } from "@oj/core";
import { db } from "../src/db";

const API = process.env.API ?? "http://localhost:8787/api";
const office = generateOfficeKeys("registry-probe.example", "Registry Probe Tax");
const post = async (path: string, body: unknown) =>
  (await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();

await post("/offices", office.bundle);
const cases = [
  { label: "unverified office, gmail sender", senderEmail: "registry.probe@gmail.com", senderDomain: "gmail.com" },
  { label: "sender on the registered domain", senderEmail: "docs@registry-probe.example", senderDomain: "registry-probe.example" },
];
for (const c of cases) {
  const r = await post("/check", { claimedOrg: "Registry Probe Tax", senderEmail: c.senderEmail, senderDomain: c.senderDomain, linkDomains: [], phones: [] });
  console.log(`${c.label}: ${r.verdict} · ${r.source} · ${r.latencyMs}ms`);
  for (const s of r.signals) console.log(`   ⚑ ${s}`);
  for (const e of r.evidence) console.log(`   [${e.source}${e.verified ? " ✓" : ""}] ${e.quote}`);
}
await db().from("offices").delete().eq("domain", "registry-probe.example");
await db().from("check_cache").delete().like("org_key", "registry:registry-probe%");
console.log("probe office removed");
