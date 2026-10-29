import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { productCode } from "../../services/domain/src/product-code";

test("product codes use explicit user-selected type and stable five-part format", () => {
  assert.equal(productCode("miding", "SOFTWARE", "SELF_DEVELOPED", 1), "ZJ-D-S-A-001");
  assert.equal(productCode("miyi", "HARDWARE", "PARTNER", 999), "ZJ-Y-H-B-999");
  assert.throws(() => productCode("miyi", "HARDWARE", "PARTNER", 1000));
  assert.throws(() => productCode("unknown", "SOFTWARE", "SELF_DEVELOPED", 1));
  assert.throws(() => productCode("miding", "SOFTWARE", "SELF_DEVELOPED", 0));
});

test("legacy products keep their code and missing attributes until publication", async () => {
  const { MockStore } = await import("../../services/mock-api/src/store");
  const { rm } = await import("node:fs/promises");
  const store = new MockStore();
  try {
    const original = store.draft("ZJ-001");
    const saved = store.save("ZJ-001", { expectedDraftVersion: original.draftVersion, content: { ...original.content, summary: "仅用于本地验证" } }, "test");
    assert.equal(saved.productId, "ZJ-001"); assert.equal(saved.content.model, undefined);
    assert.throws(() => store.publish("ZJ-001", { expectedDraftVersion: saved.draftVersion, expectedPublicationVersion: 0, publicContentConfirmed: true }, randomUUID(), "test"), (error: unknown) => {
      const fields = (error as { fields: { path: string }[] }).fields;
      return fields.some((field) => field.path === "/model") && fields.some((field) => field.path === "/ownership");
    });
  } finally { await rm(store.assets.directory, { recursive: true, force: true }); }
});
