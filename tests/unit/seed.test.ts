import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDevelopmentSeed,
  planSeed,
  seedProducts,
} from "../../services/mock-api/src/seed";
import { validateTemplateContent } from "@zj/template-registry";
import pilots from "../../data/pilot-products.json";
test("baseline seeds remain private and match the six pilot IDs in order", () => {
  assert.equal(seedProducts.length, 27);
  assert.deepEqual(
    pilots.map((p) => p.productId),
    ["ZJ-001", "ZJ-002", "ZJ-009", "ZJ-008", "ZJ-006", "ZJ-015"],
  );
  for (const p of seedProducts) {
    assert.equal(p.publicationState, "DRAFT");
    assert.equal(p.activeReleaseId, null);
    assert.equal(p.draft.materials.length, 0);
    assert.equal(p.draft.summary, "");
    assert.deepEqual(validateTemplateContent(p.draft), []);
  }
});
test("dry-run is pure, repeat seed inserts nothing, and edited records survive", () => {
  const original = structuredClone(seedProducts[0]);
  original.draft.summary = "用户已经编辑的内容";
  const existing = [original];
  const before = structuredClone(existing);
  const plan = planSeed(existing, 80);
  assert.equal(plan.insert.length, 26);
  assert.equal(plan.counterNext, 80);
  assert.deepEqual(existing, before);
  const applied = applyDevelopmentSeed(existing, 80);
  assert.equal(
    applied.products.find((p) => p.productId === original.productId)?.draft
      .summary,
    original.draft.summary,
  );
  const second = planSeed(applied.products, applied.counterNext);
  assert.equal(second.insert.length, 0);
  assert.equal(second.counterNext, 80);
});
test("counter derives from maximum identifier, never array length or reset", () => {
  assert.equal(planSeed([]).counterNext, 28);
  const distant = { ...structuredClone(seedProducts[0]), productId: "ZJ-1200" };
  assert.equal(planSeed([distant], 28).counterNext, 1201);
  assert.throws(() => planSeed([distant, distant]));
  assert.throws(() => planSeed([], 0));
});
test("seed cannot import a published record", () => {
  const p = {
    ...structuredClone(seedProducts[0]),
    publicationState: "PUBLISHED" as const,
    activeReleaseId: "test-only",
  };
  assert.throws(() => planSeed([], 1, [p]));
});
