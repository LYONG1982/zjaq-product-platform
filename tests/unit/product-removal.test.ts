import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";
import { actorContext } from "../../services/domain/src/identity";
import { CloudBackend } from "../../services/api/src/cloud-backend";
import { initialize } from "../../services/api/src/initialize";
import { collections, type Repository, type Transaction } from "../../services/api/src/repository";
import { validateBackup } from "../../services/api/src/backup-validation";

const createBody = (model: string) => ({ name: "【隔离测试】安全移除", categoryId: "ai", templateId: "ai", templateVersion: 1, owner: "虚构测试人", model, productType: "SOFTWARE", ownership: "SELF_DEVELOPED" });

test("safe product removal is admin-only, versioned, idempotent, preserves history and blocks public/sales Range until explicit republish", async () => {
  const store = new MockStore(undefined, true), server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const call = async (path: string, method = "GET", body?: unknown, role = "local-admin", key?: string, more: Record<string,string> = {}) => fetch(base + path, { method, headers: { ...(role ? { Authorization: "Bearer " + role } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}), ...more }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const model = "TEST-REMOVE-" + randomUUID(), created = (await (await call("/admin/products", "POST", createBody(model), "local-admin", randomUUID())).json()).data;
    const id = created.productId, bytes = await readFile("tests/fixtures/validation/sample-v1.pdf");
    const uploadBody = { productId: id, purpose: "preview", fileName: "safe.pdf", contentType: "application/pdf", size: bytes.length }, uploadKey = randomUUID();
    const intent = (await (await call("/admin/uploads", "POST", uploadBody, "local-admin", uploadKey)).json()).data;
    assert.equal((await fetch(base.replace(/\/api\/v1$/, "") + intent.uploadPath, { method: "PUT", headers: { Authorization: "Bearer local-admin", "Content-Type": "application/octet-stream" }, body: bytes })).status, 200);
    const asset = (await (await call("/admin/uploads/complete", "POST", { uploadId: intent.uploadId })).json()).data; assert.equal(asset.status, "READY");
    const item = { id: "one", title: "仅本地测试", text: "虚构正文" };
    const content = { ...created.content, tagline: "虚构测试", summary: "虚构测试正文", problemValues: [item], features: [item], scenarios: [item], technical: { inputs: "文档", outputs: "草稿", humanReview: "人工" }, materials: [{ materialId: "fixture", versionId: "fixture-v1", name: "虚构资料", kind: "brochure", category: "promotional", subCategory: "deck", versionLabel: "V1.0", preview: { kind: "pdf", assetId: asset.assetId, pageCount: 2 } }] };
    const saved = (await (await call(`/admin/products/${id}/draft`, "PATCH", { expectedDraftVersion: 1, content })).json()).data;
    const publishBody = { expectedDraftVersion: saved.draftVersion, expectedPublicationVersion: 0, publicContentConfirmed: true }, publishKey = randomUUID();
    const published = (await (await call(`/admin/products/${id}/publish`, "POST", publishBody, "local-admin", publishKey)).json()).data;
    const publicId = store.product(id).publicId!, manifest = store.manifest(publicId, "fixture"), publicPart = manifest.parts[0].path;
    const relativePart = publicPart.replace(/^\/api\/v1/, "");
    assert.equal((await call(relativePart, "GET", undefined, "", undefined, { Range: "bytes=0-3" })).status, 206);
    const mediaSession = await call("/admin/media-session", "POST", undefined, "local-mock"); assert.equal(mediaSession.status, 204);
    const contentCookie = mediaSession.headers.get("set-cookie")!.split(";")[0];
    const pending = (await (await call("/admin/uploads", "POST", { ...uploadBody, fileName: "pending.pdf" }, "local-admin", randomUUID())).json()).data;
    const snapshot = structuredClone(store.releases.get(published.releaseId)), history = structuredClone([...store.materialHistory]), assetsBefore = structuredClone([...store.assets.uploads]);
    const removeBody = { expectedDraftVersion: saved.draftVersion, expectedPublicationVersion: published.publicationVersion, reason: "测试结束，保留留档", confirmed: true }, key = randomUUID();
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", removeBody, "", key)).status, 401);
    for (const role of ["local-mock", "local-sales"]) assert.equal((await call(`/admin/products/${id}/remove`, "POST", removeBody, role, key)).status, 403);
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", { ...removeBody, reason: "  " }, "local-admin", randomUUID())).status, 422);
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", { ...removeBody, expectedDraftVersion: 999 }, "local-admin", randomUUID())).status, 409);
    const removedResponse = await call(`/admin/products/${id}/remove`, "POST", removeBody, "local-admin", key); assert.equal(removedResponse.status, 200);
    const removed = (await removedResponse.json()).data;
    assert.equal(removed.publicationState, "OFFLINE"); assert.ok(removed.deletedAt); assert.equal(removed.deletedBy, "mock-admin"); assert.equal(removed.deletionReason, removeBody.reason);
    assert.equal(store.product(id).activeReleaseId, null); assert.equal(store.product(id).lastReleaseId, published.releaseId); assert.equal(store.product(id).publicId, publicId);
    assert.deepEqual(store.releases.get(published.releaseId), snapshot); assert.deepEqual([...store.materialHistory], history); assert.deepEqual([...store.assets.uploads], assetsBefore);
    const events = store.events.length; assert.deepEqual((await (await call(`/admin/products/${id}/remove`, "POST", removeBody, "local-admin", key)).json()).data, removed); assert.equal(store.events.length, events);
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", { ...removeBody, reason: "另一个原因" }, "local-admin", key)).status, 409);
    assert.equal((await (await call("/admin/products?limit=100")).json()).data.some((p: any) => p.productId === id), false);
    const removedList = (await (await call("/admin/products?removed=true")).json()).data; assert.equal(removedList[0].productId, id);
    assert.equal((await call("/admin/products?removed=true", "GET", undefined, "local-mock")).status, 403);
    assert.equal((await call(`/admin/products/${id}/draft`, "GET", undefined, "local-mock")).status, 404);
    assert.equal((await call(`/admin/products/${id}/material-versions`)).status, 200);
    const adminAsset = `/admin/products/${id}/assets/${asset.assetId}/content`;
    assert.equal((await call(adminAsset)).status, 200); assert.equal((await call(adminAsset, "GET", undefined, "local-mock")).status, 404);
    assert.equal((await call(adminAsset, "GET", undefined, "", undefined, { Cookie: contentCookie, Range: "bytes=0-3" })).status, 404);
    const rejectedPut = await fetch(base.replace(/\/api\/v1$/, "") + pending.uploadPath, { method: "PUT", headers: { Authorization: "Bearer local-admin", "Content-Type": "application/octet-stream" }, body: bytes });
    assert.equal(rejectedPut.status, 409); assert.equal((await rejectedPut.json()).error.code, "PRODUCT_REMOVED");
    assert.equal((await call(`/admin/products/${id}/draft`, "PATCH", { expectedDraftVersion: removed.draftVersion, content })).status, 409);
    assert.equal((await call(`/admin/products/${id}/publish`, "POST", publishBody, "local-admin", publishKey)).status, 409);
    assert.equal((await call("/admin/uploads", "POST", uploadBody, "local-admin", uploadKey)).status, 409);
    assert.equal((await call("/admin/uploads/complete", "POST", { uploadId: intent.uploadId })).status, 409);
    for (const role of ["", "local-sales"]) {
      const prefix = role ? "/sales" : "";
      assert.equal((await call(`${prefix}/catalog/products/${publicId}`, "GET", undefined, role)).status, 404);
      for (const range of ["bytes=0-3", "bytes=999999999-"]) assert.equal((await call(prefix + relativePart, "GET", undefined, role, undefined, { Range: range })).status, 404);
    }
    assert.equal((await call("/admin/products", "POST", createBody(model), "local-admin", randomUUID())).status, 409);
    const restoreBody = { expectedDraftVersion: removed.draftVersion, expectedPublicationVersion: removed.publicationVersion, reason: "测试恢复，不自动上架", confirmed: true }, restoreKey = randomUUID();
    assert.equal((await call(`/admin/products/${id}/restore`, "POST", removeBody, "local-admin", randomUUID())).status, 409);
    const restored = (await (await call(`/admin/products/${id}/restore`, "POST", restoreBody, "local-admin", restoreKey)).json()).data;
    assert.equal(restored.deletedAt, null); assert.equal(restored.publicationState, "OFFLINE"); assert.equal(store.product(id).activeReleaseId, null);
    assert.equal((await call(`/catalog/products/${publicId}`, "GET", undefined, "")).status, 404);
    assert.deepEqual((await (await call(`/admin/products/${id}/restore`, "POST", restoreBody, "local-admin", restoreKey)).json()).data, restored);
    const republished = await call(`/admin/products/${id}/publish`, "POST", { expectedDraftVersion: restored.draftVersion, expectedPublicationVersion: restored.publicationVersion, publicContentConfirmed: true }, "local-admin", randomUUID()); assert.equal(republished.status, 200);
    assert.equal((await call(`/catalog/products/${publicId}`, "GET", undefined, "")).status, 200);
    assert.equal((await call(relativePart, "GET", undefined, "", undefined, { Range: "bytes=0-3" })).status, 409);
    const current = store.draft(id), again = { expectedDraftVersion: current.draftVersion, expectedPublicationVersion: current.publicationVersion, reason: "再次移除，验证旧恢复回放不会复活", confirmed: true };
    const removedAgain = await call(`/admin/products/${id}/remove`, "POST", again, "local-admin", randomUUID()); assert.equal(removedAgain.status, 200);
    const afterSecondRemoval = structuredClone(store.product(id)), eventCount = store.events.length;
    assert.equal((await call(`/admin/products/${id}/restore`, "POST", restoreBody, "local-admin", restoreKey)).status, 200);
    assert.deepEqual(store.product(id), afterSecondRemoval); assert.equal(store.events.length, eventCount);
    assert.equal((await call(`/catalog/products/${publicId}`, "GET", undefined, "")).status, 404);
    assert.equal(store.events.find(e => e.action === "REMOVE_PRODUCT")?.reason, removeBody.reason); assert.equal(store.events.find(e => e.action === "RESTORE_PRODUCT")?.reason, restoreBody.reason);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(store.assets.directory, { recursive: true, force: true }); }
});

class Harness implements Repository {
  data = new Map<string, any>(); fail = false;
  async get<T>(c: string, id: string) { return structuredClone(this.data.get(c + "/" + id)) as T | undefined; }
  async set(c: string, id: string, value: unknown) { this.data.set(c + "/" + id, structuredClone(value)); }
  async list<T>(c: string) { return [...this.data].filter(([k]) => k.startsWith(c + "/")).map(([,v]) => structuredClone(v) as T); }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>) { const before = structuredClone(this.data); try { const value = await fn(this); if (this.fail) throw new Error("INJECTED_FAILURE"); return value; } catch (error) { this.data = before; throw error; } }
}

test("cloud removal rolls back atomically, keeps draft state/model/UUID indexes and survives private backup validation", async () => {
  const repo = new Harness(); await initialize(repo, "test-admin");
  const backend = new CloudBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { throw new Error("unused"); }, async download() { throw new Error("unused"); } });
  await actorContext.run(await backend.authenticate("test"), async () => {
    const created = await backend.create(createBody("CLOUD-REMOVE"), randomUUID(), "create"), id = created.productId;
    const before = structuredClone(repo.data), body = { expectedDraftVersion: 1, expectedPublicationVersion: 0, reason: "隔离事务验证", confirmed: true }, key = randomUUID();
    repo.fail = true; await assert.rejects(backend.removeProduct(id, body, key, "remove"), /INJECTED/); assert.deepEqual(repo.data, before); repo.fail = false;
    const removed = await backend.removeProduct(id, body, key, "remove"); assert.equal(removed.publicationState, "DRAFT"); assert.ok(removed.deletedAt);
    const index = await repo.get<any>("control", "public-" + (await repo.get<any>("products", id)).publicId); assert.equal(index.productId, id);
    const after = structuredClone(repo.data); assert.deepEqual(await backend.removeProduct(id, body, key, "retry"), removed); assert.deepEqual(repo.data, after);
    await assert.rejects(backend.create(createBody("CLOUD-REMOVE"), randomUUID(), "duplicate-model"), { status: 409 });
    const records = Object.fromEntries(collections.filter(c => c !== "rates").map(c => [c, [...repo.data].filter(([k]) => k.startsWith(c + "/")).map(([k,v]) => ({ _id: k.slice(c.length + 1), ...v }))]));
    const backup = validateBackup({ format: 1, environment: "test-only", revision: (await repo.get<any>("control", "state")).revision, records, files: [] });
    assert.equal(backup.records.products.find(p => p.productId === id)?.deletionReason, body.reason);
    const malformed = structuredClone(backup); malformed.records.products.find(p => p.productId === id)!.publicationState = "PUBLISHED";
    assert.throws(() => validateBackup(malformed), /INVALID_PRODUCT_REMOVAL_STATE/);
    const restoreKey = randomUUID(), restoreBody = { expectedDraftVersion: removed.draftVersion, expectedPublicationVersion: 0, reason: "恢复隔离草稿", confirmed: true };
    const restored = await backend.restoreProduct(id, restoreBody, restoreKey, "restore"); assert.equal(restored.publicationState, "DRAFT"); assert.equal(restored.deletedAt, null);
    await backend.removeProduct(id, { expectedDraftVersion: restored.draftVersion, expectedPublicationVersion: restored.publicationVersion, reason: "再次移除", confirmed: true }, randomUUID(), "second-remove");
    const afterSecondRemoval = structuredClone(repo.data);
    await backend.restoreProduct(id, restoreBody, restoreKey, "stale-restore-replay");
    assert.deepEqual(repo.data, afterSecondRemoval);
    await backend.removeProduct(id, body, key, "stale-remove-replay");
    assert.deepEqual(repo.data, afterSecondRemoval);
  });
});

test("Cloud upload commit rechecks a product removed while its private object was being stored", async () => {
  const repo = new Harness(); await initialize(repo, "test-admin"); let created: any, removedObject = false;
  const backend = new CloudBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { await backend.removeProduct(created.productId, { expectedDraftVersion: 1, expectedPublicationVersion: 0, reason: "上传过程中移除", confirmed: true }, randomUUID(), "remove-during-upload"); return "private-test-object"; }, async download() { throw new Error("unused"); }, async remove() { removedObject = true; } });
  await actorContext.run(await backend.authenticate("test"), async () => {
    created = await backend.create(createBody("CLOUD-REMOVE-RACE"), randomUUID(), "create");
    const bytes = await readFile("tests/fixtures/validation/sample-v1.pdf"), intent = await backend.createUpload({ productId: created.productId, purpose: "preview", fileName: "pending.pdf", contentType: "application/pdf", size: bytes.length }, randomUUID());
    const request = Readable.from([bytes]) as any; request.headers = { "content-type": "application/octet-stream" };
    await assert.rejects(backend.put(intent.uploadId, request), { status: 409, code: "PRODUCT_REMOVED" }); assert.equal(removedObject, true);
    assert.equal((await repo.get<any>("assets", intent.assetId)).fileId, undefined);
    await assert.rejects(backend.complete(intent.uploadId), { status: 409, code: "PRODUCT_REMOVED" });
  });
});
