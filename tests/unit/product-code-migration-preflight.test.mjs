import test from "node:test";
import assert from "node:assert/strict";
import { preflight } from "../../scripts/product-code-migration-preflight.mjs";

const products = [
  { productId: "ZJ-001", draft: { categoryId: "miding", templateId: "software" } },
  { productId: "ZJ-002", draft: { categoryId: "miding", templateId: "software" } },
];
const data = [
  { productId: "ZJ-001", confirmed: true, model: "A", ownership: "SELF_DEVELOPED", categoryId: "miding", productType: "SOFTWARE" },
  { productId: "ZJ-002", confirmed: true, model: "B", ownership: "SELF_DEVELOPED", categoryId: "miding", productType: "SOFTWARE" },
];
const checks = { inventoryConfirmed: true, referencesConfirmed: true };
test("does not propose partial mappings without verified inputs", () => {
  const result = preflight(products, data.slice(0, 1), [], checks);
  assert.equal(result.ready, false);
  assert.deepEqual(result.mappings, []);
  assert.equal(result.problems[0].oldProductId, "ZJ-002");
});
test("generates deterministic unique mappings and preserves old IDs", () => {
  const result = preflight([...products].reverse(), data, [], checks);
  assert.equal(result.ready, true);
  assert.deepEqual(result.mappings.map((m) => [m.oldProductId, m.newProductId]), [
    ["ZJ-001", "ZJ-D-S-A-001"], ["ZJ-002", "ZJ-D-S-A-002"],
  ]);
  assert.throws(() => preflight(products, data, ["ZJ-D-S-A-001"], checks), /目标编码冲突/);
});
test("rejects ambiguous duplicate models and unconfirmed inputs", () => {
  assert.equal(preflight(products, [data[0], { ...data[1], model: "Ａ" }], [], checks).ready, false);
  assert.equal(preflight(products, [data[0], { ...data[1], confirmed: false }], [], checks).ready, false);
  assert.equal(preflight(products, data).ready, false);
  assert.equal(preflight(products, [data[0], { ...data[1], categoryId: "ai" }], [], checks).ready, false);
  assert.equal(preflight(products, [data[0], { ...data[1], productType: undefined }], [], checks).ready, false);
  assert.throws(() => preflight(products, [data[0], data[0]]), /未知或重复/);
});
