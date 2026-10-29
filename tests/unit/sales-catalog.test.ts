import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";

test("sales reads only current release with scoped preview and source downloads", async () => {
  const store = new MockStore(undefined, true), product = store.product("ZJ-001");
  product.publicId = "4655ca52-6f0f-4ab8-9ec0-2e2521954cca";
  product.publicationState = "PUBLISHED";
  product.activeReleaseId = product.lastReleaseId = "released";
  product.draft.aliases = ["销售内部别名"];
  product.draft.ownership = "SELF_DEVELOPED";
  const material = { materialId: "technical", versionId: "v1", name: "技术文件", kind: "brochure" as const,
    category: "technical" as const, subCategory: "spec" as const, versionLabel: "V1.0", sourceAssetId: "source-id",
    preview: { kind: "pdf" as const, assetId: "preview-id", pageCount: 1 } };
  const { category: _category, subCategory: _subCategory, ...legacy } = { ...material, materialId: "legacy" };
  product.draft.materials = [material, legacy];
  store.releases.set("released", { id: "released", productId: product.productId, sequence: 1,
    content: structuredClone(product.draft), publishedAt: "2026-10-29T00:00:00Z", publishedBy: "test" });
  for (const [id, purpose, type] of [["source-id", "source", "pptx"], ["preview-id", "preview", "pdf"]]) {
    const path = join(store.assets.directory, id); await writeFile(path, "fixture bytes");
    store.assets.uploads.set(id, { assetId: id, productId: product.productId, status: "READY", purpose,
      type, mimeType: type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation", path } as never);
  }
  const server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`, headers = { Authorization: "Bearer local-sales" };
  const productPath = `/sales/catalog/products/${product.publicId}`;
  try {
    assert.equal((await fetch(base + productPath)).status, 401);
    assert.equal((await fetch(base + productPath, { headers: { Authorization: "Bearer local-admin" } })).status, 403);
    const search = await (await fetch(base + `/sales/catalog/products?q=${encodeURIComponent("销售内部别名")}`, { headers })).json();
    assert.equal(search.data.length, 1); assert.ok(!JSON.stringify(search).includes("销售内部别名"));
    assert.equal((await (await fetch(base + "/sales/catalog/products?updatedFrom=2026-10-29&updatedTo=2026-10-29", { headers })).json()).data.length, 1);
    assert.equal((await (await fetch(base + "/sales/catalog/products?updatedTo=2026-10-28", { headers })).json()).data.length, 0);
    assert.equal((await (await fetch(base + "/sales/catalog/products?ownership=SELF_DEVELOPED", { headers })).json()).data.length, 1);
    assert.equal((await (await fetch(base + "/sales/catalog/products?ownership=PARTNER", { headers })).json()).data.length, 0);
    assert.equal((await fetch(base + "/sales/catalog/products?updatedFrom=2026-02-30", { headers })).status, 400);
    assert.equal((await fetch(base + "/sales/catalog/products?updatedFrom=2026-10-30&updatedTo=2026-10-29", { headers })).status, 400);
    assert.equal((await (await fetch(base + `/catalog/products?q=${encodeURIComponent("销售内部别名")}`)).json()).data.length, 0);
    assert.equal((await (await fetch(base + `/catalog/products/${product.publicId}`)).json()).data.materials.length, 0);
    const salesDetail = await (await fetch(base + productPath, { headers })).json();
    assert.equal(salesDetail.data.materials[0].materialId, "technical");
    assert.equal(salesDetail.data.materials[1].materialId, "legacy");
    assert.ok(!JSON.stringify(salesDetail).includes("source-id"));
    const materialCatalog = "/sales/catalog/materials?q=" + encodeURIComponent("销售内部别名");
    assert.equal((await fetch(base + materialCatalog)).status, 401);
    const catalog = (await (await fetch(base + materialCatalog, { headers })).json()).data;
    assert.equal(catalog.length, 2);
    assert.equal(catalog[0].material.materialId, "technical");
    assert.match(catalog[0].material.previewPath, /\/sales\/catalog\//);
    assert.ok(!JSON.stringify(catalog).includes(product.productId));
    assert.equal((await (await fetch(base + materialCatalog + "&limit=1", { headers })).json()).data.length, 1);
    assert.equal((await fetch(base + productPath + "/media/not-real?releaseId=released")).status, 401);
    assert.equal((await fetch(base + productPath + "/media/not-real?releaseId=released", { headers })).status, 404);
    const manifest = await (await fetch(base + productPath + "/materials/technical/preview", { headers })).json();
    assert.match(manifest.data.parts[0].path, /\/sales\/catalog\//);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}` + manifest.data.parts[0].path)).status, 401);
    assert.equal((await fetch(`http://127.0.0.1:${address.port}` + manifest.data.parts[0].path, { headers })).status, 200);
    const source = productPath + "/materials/technical/source?releaseId=released&versionId=v1";
    const download = await fetch(base + source, { headers });
    assert.equal(download.status, 200); assert.match(download.headers.get("content-disposition")!, /^attachment;/);
    assert.equal(await download.text(), "fixture bytes");
    assert.equal((await fetch(base + source.replace("versionId=v1", "versionId=old"), { headers })).status, 409);
    material.sourceAssetId = "preview-id";
    store.releases.get("released")!.content.materials[0].sourceAssetId = "preview-id";
    assert.equal((await fetch(base + source, { headers })).status, 404);
    delete store.releases.get("released")!.content.materials[0].sourceAssetId;
    const pdfDownload = await fetch(base + source, { headers });
    assert.equal(pdfDownload.status, 200);
    assert.match(pdfDownload.headers.get("content-disposition")!, /material\.pdf/);
    product.publicationState = "OFFLINE";
    assert.equal((await fetch(base + source, { headers })).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(store.assets.directory, { recursive: true, force: true });
  }
});
