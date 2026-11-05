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

test("only never-published drafts can be removed; history, role checks and legacy restoration remain intact", async () => {
  const store = new MockStore(undefined, true), server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const call = (path: string, method = "GET", body?: unknown, role = "local-admin", key = randomUUID()) => fetch(base + path, { method, headers: { ...(role ? { Authorization: "Bearer " + role } : {}), "Content-Type":"application/json", "Idempotency-Key":key }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  try {
    const created = (await (await call("/admin/products", "POST", createBody("REMOVE-" + randomUUID()))).json()).data, id = created.productId;
    const bytes = await readFile("tests/fixtures/validation/sample-v1.pdf");
    const intent = (await (await call("/admin/uploads", "POST", { productId:id, purpose:"preview", fileName:"sample.pdf", contentType:"application/pdf", size:bytes.length })).json()).data;
    await fetch(base.replace(/\/api\/v1$/, "") + intent.uploadPath, { method:"PUT", headers:{Authorization:"Bearer local-admin","Content-Type":"application/octet-stream"},body:bytes });
    const asset = (await (await call("/admin/uploads/complete", "POST", {uploadId:intent.uploadId})).json()).data;
    const content = { ...created.content, tagline:"虚构验证", summary:"虚构内容", problemValues:[{id:"problem",title:"虚构问题",text:"虚构说明"}], features:[{id:"feature",title:"虚构功能",text:"虚构说明"}], scenarios:[{id:"scenario",title:"虚构场景",text:"虚构说明"}], materials:[{materialId:"fixture",versionId:randomUUID(),name:"测试 PDF",kind:"brochure",category:"promotional",subCategory:"onepager",versionLabel:"V01.0",preview:{kind:"pdf",assetId:asset.assetId,pageCount:asset.pageCount}}] };
    const saved = (await (await call(`/admin/products/${id}/draft`, "PATCH", {expectedDraftVersion:1,content})).json()).data;
    const before = structuredClone(store.product(id)), history = structuredClone([...store.materialHistory]), assets = structuredClone([...store.assets.uploads]);
    const body = {expectedDraftVersion:saved.draftVersion,expectedPublicationVersion:0,reason:"测试结束保留留档",confirmed:true}, key = randomUUID();
    assert.equal((await call(`/admin/products/${id}/remove`,"POST",body,"",key)).status,401);
    for(const role of ["local-mock","local-sales"]) assert.equal((await call(`/admin/products/${id}/remove`,"POST",body,role,key)).status,403);
    assert.equal((await call(`/admin/products/${id}/remove`,"POST",{...body,reason:" "})).status,422);
    assert.equal((await call(`/admin/products/${id}/remove`,"POST",{...body,expectedDraftVersion:999})).status,409);
    const response = await call(`/admin/products/${id}/remove`,"POST",body,"local-admin",key); assert.equal(response.status,200);
    const removed=(await response.json()).data; assert.equal(removed.publicationState,"DRAFT");assert.ok(removed.deletedAt);
    assert.deepEqual(store.product(id).draft,before.draft);assert.deepEqual([...store.materialHistory],history);assert.deepEqual([...store.assets.uploads],assets);assert.equal(store.product(id).publicId,before.publicId);
    const eventCount=store.events.length;assert.deepEqual((await (await call(`/admin/products/${id}/remove`,"POST",body,"local-admin",key)).json()).data,removed);assert.equal(store.events.length,eventCount);
    assert.equal((await (await call("/admin/products?removed=true")).json()).data.some((row:any)=>row.productId===id),true);
    assert.equal((await call("/admin/products?removed=true","GET",undefined,"local-mock")).status,403);
    assert.equal((await call(`/admin/products/${id}/draft`,"GET",undefined,"local-mock")).status,404);
    assert.equal((await call(`/admin/products/${id}/draft`,"PATCH",{expectedDraftVersion:removed.draftVersion,content})).status,409);
    assert.equal((await call(`/admin/products/${id}/assets/${asset.assetId}/content`)).status,200);
    const restoreBody={...body,expectedDraftVersion:removed.draftVersion,reason:"恢复草稿"}, restoreKey=randomUUID();
    const restored=(await (await call(`/admin/products/${id}/restore`,"POST",restoreBody,"local-admin",restoreKey)).json()).data;
    assert.equal(restored.publicationState,"DRAFT");assert.equal(restored.deletedAt,null);
    assert.deepEqual((await (await call(`/admin/products/${id}/restore`,"POST",restoreBody,"local-admin",restoreKey)).json()).data,restored);
    const publishedResponse=await call(`/admin/products/${id}/publish`,"POST",{expectedDraftVersion:restored.draftVersion,expectedPublicationVersion:0,publicContentConfirmed:true});assert.equal(publishedResponse.status,200);
    const published=(await publishedResponse.json()).data;
    const release=structuredClone(store.releases.get(published.releaseId));
    assert.equal((await call(`/admin/products/${id}/remove`,"POST",{...body,expectedDraftVersion:restored.draftVersion,expectedPublicationVersion:published.publicationVersion})).status,409);
    const off=(await (await call(`/admin/products/${id}/unpublish`,"POST",{expectedPublicationVersion:published.publicationVersion,reason:"下架验证"})).json()).data;
    assert.equal((await call(`/admin/products/${id}/remove`,"POST",{...body,expectedDraftVersion:restored.draftVersion,expectedPublicationVersion:off.publicationVersion})).status,409);
    // Import an old tombstone explicitly: new removal policy never creates it.
    const legacy=store.product(id);legacy.deletedAt=new Date().toISOString();legacy.deletedBy="mock-admin";legacy.deletionReason="历史留档";legacy.draftVersion++;
    const legacyRestored=(await (await call(`/admin/products/${id}/restore`,"POST",{...body,expectedDraftVersion:legacy.draftVersion,expectedPublicationVersion:legacy.publicationVersion})).json()).data;
    assert.equal(legacyRestored.publicationState,"OFFLINE");assert.equal(store.product(id).activeReleaseId,null);assert.deepEqual(store.releases.get(published.releaseId),release);
    assert.equal((await call(`/catalog/products/${before.publicId}`,"GET",undefined,"")).status,404);
    assert.equal(store.events.find(e=>e.action==="REMOVE_PRODUCT")?.reason,body.reason);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(store.assets.directory,{recursive:true,force:true});}
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
