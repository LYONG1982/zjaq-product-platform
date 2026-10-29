import test from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { filters } from "../../services/domain/src/backend";
import { validateQuery } from "../../services/mock-api/src/contract";
import { MockStore } from "../../services/mock-api/src/store";

test("admin owner filter is validated and combines with other filters", async () => {
  const store = new MockStore();
  try {
    store.products.get("ZJ-001")!.draft.owner = "品牌部测试人员";
    store.products.get("ZJ-002")!.draft.owner = "销售部测试人员";
    const q = validateQuery("listAdminProducts", new URLSearchParams({ owner: "品牌部", categoryId: "miding" }));
    assert.deepEqual(filters(store).listProducts(q).map((r) => r.productId), ["ZJ-001"]);
    assert.deepEqual(filters(store).listProducts({ ...q, publicationState: "PUBLISHED" }), []);
    assert.throws(() => validateQuery("listAdminProducts", new URLSearchParams({ owner: "x".repeat(101) })));
  } finally {
    await rm(store.assets.directory, { recursive: true, force: true });
  }
});
