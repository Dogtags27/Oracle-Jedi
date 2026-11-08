import { bucket, db } from "../src/db";

const { data: offices } = await db().from("offices").select("domain").like("domain", "%.test");
const domains = (offices ?? []).map((o) => o.domain);
if (domains.length) {
  const { data: handoffs } = await db().from("handoffs").select("storage_path").in("office_domain", domains);
  const paths = (handoffs ?? []).map((h) => h.storage_path);
  if (paths.length) await bucket().remove(paths);
  await db().from("offices").delete().in("domain", domains);
}
await db().from("check_cache").delete().neq("org_key", "");
console.log(`removed ${domains.length} test offices and cleared the check cache`);
