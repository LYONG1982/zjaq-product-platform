import { createHash, randomUUID } from "node:crypto";
import type { ProductRecord } from "@zj/contracts";
import type { Repository } from "./repository";
import { isPublicProductId } from "../../domain/src/public-id";
export { isPublicProductId };
type Master = Omit<ProductRecord, "draft">;
type Entry = { productId: string; publicId: string; previousPublicId: string | null; fingerprint: string };
export type PublicIdMigration = { format: 1; revision: number; inventory: string; entries: Entry[] };
const fingerprint = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
};
function inventory(records: Master[]) {
  return fingerprint([...records].sort((a, b) => a.productId.localeCompare(b.productId)));
}
export function createPublicIdPlan(records: Master[], revision: number): PublicIdMigration {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("INVALID_REVISION");
  const internal = new Set<string>(), ids = new Set<string>();
  const entries = [...records].sort((a, b) => a.productId.localeCompare(b.productId)).map(record => {
    if (!record.productId || internal.has(record.productId)) throw new Error("DUPLICATE_INTERNAL_ID");
    internal.add(record.productId);
    if (record.publicId != null && !isPublicProductId(record.publicId)) throw new Error("INVALID_PUBLIC_ID");
    const publicId = record.publicId ?? randomUUID();
    if (ids.has(publicId.toLowerCase())) throw new Error("DUPLICATE_PUBLIC_ID");
    ids.add(publicId.toLowerCase());
    return { productId: record.productId, publicId, previousPublicId: record.publicId ?? null, fingerprint: fingerprint(record) };
  });
  return { format: 1, revision, inventory: inventory(records), entries };
}
export async function planPublicIdMigration(repo: Repository) {
  const state = await repo.get<{ revision: number }>("control", "state");
  if (!state) throw new Error("NOT_INITIALIZED");
  const records = await repo.list<Master>("products");
  const end = await repo.get<{ revision: number }>("control", "state");
  if (state.revision !== end?.revision) throw new Error("CONCURRENT_WRITES");
  return createPublicIdPlan(records, state.revision);
}
/** Explicit maintenance operation. It never changes internal IDs or immutable releases. */
export async function applyPublicIdMigration(repo: Repository, plan: PublicIdMigration) {
  if (plan?.format !== 1 || !Array.isArray(plan.entries) || !Number.isSafeInteger(plan.revision)) throw new Error("INVALID_MIGRATION_PLAN");
  const records = await repo.list<Master>("products");
  if (plan.inventory !== inventory(records) || records.length !== plan.entries.length) throw new Error("STALE_MIGRATION_PLAN");
  const internal = new Set<string>(), ids = new Set<string>();
  for (const entry of plan.entries) {
    if (!entry || internal.has(entry.productId) || !isPublicProductId(entry.publicId) || ids.has(entry.publicId.toLowerCase())) throw new Error("INVALID_MIGRATION_MAPPING");
    internal.add(entry.productId); ids.add(entry.publicId.toLowerCase());
    const record = records.find(record => record.productId === entry.productId);
    if (!record || entry.fingerprint !== fingerprint(record) || entry.previousPublicId !== (record.publicId ?? null) || (record.publicId && record.publicId !== entry.publicId)) throw new Error("STALE_MIGRATION_MAPPING");
  }
  return repo.transaction(async tx => {
    const state = await tx.get<{ ready: boolean; maintenance: boolean; revision: number }>("control", "state");
    if (!state?.maintenance || state.revision !== plan.revision) throw new Error("MAINTENANCE_AND_REVISION_REQUIRED");
    for (const entry of plan.entries) {
      const record = await tx.get<Master>("products", entry.productId);
      if (!record || fingerprint(record) !== entry.fingerprint) throw new Error("CONCURRENT_PRODUCT_CHANGE");
      const key = "public-" + entry.publicId.toLowerCase();
      const prior = await tx.get<{ productId: string }>("control", key);
      if (prior && prior.productId !== entry.productId) throw new Error("PUBLIC_ID_INDEX_CONFLICT");
      await tx.set("products", entry.productId, { ...record, publicId: entry.publicId });
      await tx.set("control", key, { productId: entry.productId });
    }
    await tx.set("control", "state", { ...state, revision: state.revision + 1 });
    const eventId = randomUUID();
    await tx.set("audit", eventId, { eventId, actorId: "maintenance-operator", actorName: "维护操作员", action: "MIGRATE_PUBLIC_IDS", targetId: "public-id-mapping", requestId: plan.inventory, createdAt: new Date().toISOString(), draftVersion: null, publicationVersion: null, releaseSequence: null });
    return { migrated: plan.entries.filter(e => !e.previousPublicId).length, indexed: plan.entries.length, revision: plan.revision + 1 };
  });
}
