import type { ProductRecord } from "@zj/contracts";
import products from "../../../data/products.master.seed.json";
import { assertSchema } from "@zj/contracts/validation";
export const seedProducts: ProductRecord[] = products.map((value: unknown) => {
  assertSchema("domain", "ProductRecord", value);
  return value as ProductRecord;
});
export function planSeed(
  existing: ProductRecord[],
  counterNext = 1,
  incoming: ProductRecord[] = seedProducts,
) {
  const seen = new Set<string>();
  for (const p of [...existing, ...incoming]) {
    assertSchema("domain", "ProductRecord", p);
    if (!/^ZJ-\d{3,}$/.test(p.productId))
      throw new Error("Invalid product identifier");
  }
  for (const p of existing) {
    if (seen.has(p.productId)) throw new Error("Duplicate existing identifier");
    seen.add(p.productId);
  }
  const sourceIds = new Set<string>();
  for (const p of incoming) {
    if (sourceIds.has(p.productId))
      throw new Error("Duplicate incoming identifier");
    sourceIds.add(p.productId);
    if (p.publicationState !== "DRAFT" || p.activeReleaseId !== null)
      throw new Error("Seed must stay private draft");
  }
  if (!Number.isSafeInteger(counterNext) || counterNext < 1)
    throw new Error("Invalid counter");
  const max = Math.max(
    0,
    ...[...existing, ...incoming].map((p) => Number(p.productId.slice(3))),
  );
  if (!Number.isSafeInteger(max + 1))
    throw new Error("Identifier exceeds safe integer range");
  return {
    insert: structuredClone(incoming.filter((p) => !seen.has(p.productId))),
    skipped: incoming
      .filter((p) => seen.has(p.productId))
      .map((p) => p.productId),
    counterNext: Math.max(max + 1, counterNext),
  };
}
export function applyDevelopmentSeed(
  existing: ProductRecord[],
  counterNext = 1,
) {
  const plan = planSeed(existing, counterNext);
  return {
    products: [...structuredClone(existing), ...plan.insert],
    counterNext: plan.counterNext,
  };
}
