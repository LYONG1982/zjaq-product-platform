import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";

test("public material access fails closed for technical, unclassified and revoked items", async () => {
  const store = new MockStore();
  const product = store.products.get("ZJ-001")!;
  product.publicId = "fd7e9739-fd4f-4d74-bc53-84305f641a9d";
  const promotional = {
    materialId: "promo", versionId: "v1", name: "宣传资料", kind: "brochure" as const,
    category: "promotional" as const, subCategory: "deck" as const, versionLabel: "V1.0",
    preview: { kind: "pdf" as const, assetId: "asset-promo", pageCount: 1 },
  };
  const technical = { ...promotional, materialId: "technical", name: "技术资料", category: "technical" as const, subCategory: "spec" as const };
  const { category: _category, subCategory: _subCategory, ...legacy } = { ...promotional, materialId: "legacy", name: "未分类资料" };
  product.publicationState = "PUBLISHED";
  product.activeReleaseId = "release-1";
  product.lastReleaseId = "release-1";
  product.draft.materials = [promotional, technical, legacy];
  product.draft.aliases = ["仅供内部检索的别名"];
  store.releases.set("release-1", {
    id: "release-1", productId: product.productId, sequence: 1,
    content: structuredClone(product.draft), publishedAt: "2026-10-29T00:00:00Z", publishedBy: "mock",
  });
  const server = makeMockServer({ APP_ENV: "test" }, store);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1/catalog`;
  try {
    const path = `${base}/products/${product.publicId}`;
    const listing = await (await fetch(`${base}/products`)).json();
    assert.equal(listing.data[0].productId, product.publicId);
    assert.ok(!JSON.stringify(listing).includes("ZJ-001"));
    assert.equal((await fetch(`${base}/products/ZJ-001`)).status, 404);
    // Imported legacy published records without a durable public mapping fail
    // closed until a controlled migration or a new publication supplies one.
    delete product.publicId;
    assert.equal((await fetch(path)).status, 404);
    assert.deepEqual((await (await fetch(`${base}/products`)).json()).data, []);
    product.publicId = "fd7e9739-fd4f-4d74-bc53-84305f641a9d";
    const detail = await (await fetch(path)).json();
    assert.ok(!JSON.stringify(detail).includes("ZJ-001"));
    assert.deepEqual(detail.data.materials.map((m: { materialId: string }) => m.materialId), ["promo"]);
    const list = await (await fetch(`${base}/materials`)).json();
    assert.deepEqual(list.data.map((m: { material: { materialId: string } }) => m.material.materialId), ["promo"]);
    const aliasSearch = await (await fetch(`${base}/products?q=${encodeURIComponent("仅供内部检索的别名")}`)).json();
    assert.deepEqual(aliasSearch.data, []);
    assert.ok(!Object.hasOwn(detail.data, "boundaries"));
    for (const id of ["technical", "legacy"]) {
      assert.equal((await fetch(`${path}/materials/${id}/preview`)).status, 404);
      assert.equal((await fetch(`${path}/materials/${id}/preview/content?releaseId=release-1&versionId=v1&part=pdf`, { headers: { Range: "bytes=0-5" } })).status, 404);
    }
    const manifestResponse = await fetch(`${path}/materials/promo/preview`);
    assert.equal(manifestResponse.status, 200);
    assert.ok(!JSON.stringify(await manifestResponse.json()).includes("ZJ-001"));
    store.assets.uploads.set("fake-upload", {
      assetId: "asset-promo", productId: "ZJ-001", status: "READY", purpose: "preview",
      mimeType: "application/pdf", pageCount: 1,
    } as never);
    const technicalDraft = structuredClone(product.draft);
    technicalDraft.materials = [{ ...promotional, versionId: "v2", versionLabel: "V2.0", category: "technical", subCategory: "spec" }];
    store.save("ZJ-001", { expectedDraftVersion: product.draftVersion, content: technicalDraft }, "test-save");
    assert.equal((await fetch(`${path}/materials/promo/preview`)).status, 404);
    assert.deepEqual((await (await fetch(path)).json()).data.materials, []);
    const saved = store.product("ZJ-001");
    const reopened = structuredClone(saved.draft);
    reopened.materials[0] = { ...promotional, versionId: "v3", versionLabel: "V3.0" };
    store.save("ZJ-001", { expectedDraftVersion: saved.draftVersion, content: reopened }, "test-save-again");
    assert.equal((await fetch(`${path}/materials/promo/preview`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(store.assets.directory, { recursive: true, force: true });
  }
});
