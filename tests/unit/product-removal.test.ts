import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { TestStore } from "../support/store";
import { makeTestServer } from "../support/server";
import { actorContext } from "../../services/domain/src/identity";
import { DomainBackend } from "../../services/api/src/domain-backend";
import { bootstrapTestRepo } from "../support/bootstrap";
import { type Repository, type Transaction } from "../../services/api/src/repository";
import { normalizedModel } from "../../services/domain/src/product-code";
import { verifyProductIndexes } from "../../services/api/src/product-index-reconciliation";

const createBody = (model: string) => ({ name: "【隔离测试】安全移除", categoryId: "ai", templateId: "ai", templateVersion: 1, owner: "虚构测试人", model, productType: "SOFTWARE", ownership: "SELF_DEVELOPED" });

test("removing a draft is permanent, requires the exact code, and frees the code and model", async () => {
  const store = new TestStore(undefined, true), server = makeTestServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const call = (path: string, method = "GET", body?: unknown, role = "local-admin", key = randomUUID()) => fetch(base + path, { method, headers: { ...(role ? { Authorization: "Bearer " + role } : {}), "Content-Type":"application/json", "Idempotency-Key":key }, ...(body === undefined ? {} : { body:JSON.stringify(body) }) });
  try {
    const model = "REMOVE-" + randomUUID();
    const created = (await (await call("/admin/products", "POST", createBody(model))).json()).data, id = created.productId;
    const body = { expectedDraftVersion: 1, expectedPublicationVersion: 0, reason: "清理验证产品", confirmation: id, confirmed: true }, key = randomUUID();
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", body, "", key)).status, 401);
    for (const role of ["local-mock", "local-sales"]) assert.equal((await call(`/admin/products/${id}/remove`, "POST", body, role, key)).status, 403);
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", { ...body, reason: " " })).status, 422);
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", { ...body, confirmation: "ZJ-A-S-A-999" })).status, 422);
    assert.equal((await call(`/admin/products/${id}/remove`, "POST", { ...body, expectedDraftVersion: 999 })).status, 409);
    assert.equal((await call(`/admin/products/${id}/restore`, "POST", body)).status, 404);
    const response = await call(`/admin/products/${id}/remove`, "POST", body, "local-admin", key);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data, { productId: id });
    assert.deepEqual((await (await call(`/admin/products/${id}/remove`, "POST", body, "local-admin", key)).json()).data, { productId: id });
    assert.equal((await call(`/admin/products/${id}/draft`)).status, 404);
    assert.equal((await call("/admin/products?removed=true")).status, 200);
    assert.equal((await (await call("/admin/products?removed=true")).json()).data.length, 0);
    const events = store.events.filter((e) => e.action === "REMOVE_PRODUCT");
    assert.equal(events.length, 1);
    assert.equal(events[0].targetId, id);
    assert.equal(events[0].reason, body.reason);
    const recreated = (await (await call("/admin/products", "POST", { ...createBody(model), sequence: 1 })).json()).data;
    assert.equal(recreated.productId, id);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(store.assets.directory, { recursive: true, force: true }); }
});

class Harness implements Repository {
  data = new Map<string, any>(); fail = false;
  async get<T>(c: string, id: string) { return structuredClone(this.data.get(c + "/" + id)) as T | undefined; }
  async set(c: string, id: string, value: unknown) { this.data.set(c + "/" + id, structuredClone(value)); }
  async delete(c: string, id: string) { this.data.delete(c + "/" + id); }
  async list<T>(c: string) { return [...this.data].filter(([k]) => k.startsWith(c + "/")).map(([,v]) => structuredClone(v) as T); }
  async *entries<T>(c: string) { for (const [k, v] of this.data) if (k.startsWith(c + "/")) yield { id: k.slice(c.length + 1), value: structuredClone(v) as T }; }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>) { const before = structuredClone(this.data); try { const value = await fn(this); if (this.fail) throw new Error("INJECTED_FAILURE"); return value; } catch (error) { this.data = before; throw error; } }
}

test("Cloud removal rolls back atomically and clears documents, snapshots, indexes and assets", async () => {
  const repo = new Harness(); await bootstrapTestRepo(repo, "test-admin");
  const removedFiles: string[] = [];
  const backend = new DomainBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { throw new Error("unused"); }, async download() { throw new Error("unused"); }, async remove(ids: string[]) { removedFiles.push(...ids); } });
  await actorContext.run(await backend.authenticate("test"), async () => {
    const created = await backend.create({ ...createBody("CLOUD-REMOVE"), categoryId: "miding", templateId: "software" }, randomUUID(), "create");
    const id = created.productId;
    assert.equal(id, "ZJ-D-S-A-001");
    const publicId = (await repo.get<any>("products", id)).publicId;
    const releaseId = randomUUID();
    await repo.set("releases", releaseId, {
      id: releaseId,
      productId: id,
      sequence: 1,
      content: { ...created.content, categoryId: "miding", templateId: "software" },
      publishedAt: new Date().toISOString(),
      publishedBy: "test-admin",
    });
    const master = await repo.get<any>("products", id);
    master.publicationVersion = 3;
    master.releaseSequence = 1;
    master.lastReleaseId = releaseId;
    master.lastPublishedDraftVersion = 1;
    await repo.set("products", id, master);
    const modelId = "model-" + createHash("sha256").update(normalizedModel("CLOUD-REMOVE")).digest("hex");
    assert.equal((await repo.get<any>("control", modelId)).productId, id);
    const assetId = randomUUID(), uploadId = randomUUID();
    await repo.set("assets", assetId, { assetId, uploadId, productId: id, status: "READY", purpose: "preview", fileId: "private/raw/one", previewFileId: "private/preview/two" });
    await repo.set("uploads", uploadId, { assetId });
    const categoryRefs = (await repo.get<any>("control", "catalog")).references.miding?.count ?? 0;
    const body = { expectedDraftVersion: 1, expectedPublicationVersion: 3, reason: "清理验证产品", confirmation: id, confirmed: true as const };
    const before = structuredClone(repo.data);
    repo.fail = true;
    await assert.rejects(backend.removeProduct(id, body, randomUUID(), "remove"), /INJECTED/);
    assert.deepEqual(repo.data, before);
    repo.fail = false;
    const key = randomUUID();
    const removed = await backend.removeProduct(id, body, key, "remove");
    assert.deepEqual(removed, { productId: id });
    for (const collection of ["products", "drafts", "history"]) assert.equal(await repo.get(collection, id), undefined);
    assert.equal(await repo.get("releases", releaseId), undefined);
    assert.equal(await repo.get("control", modelId), undefined);
    assert.equal(await repo.get("control", "public-" + publicId), undefined);
    assert.equal(await repo.get("assets", assetId), undefined);
    assert.equal(await repo.get("uploads", uploadId), undefined);
    assert.deepEqual(removedFiles, ["private/raw/one", "private/preview/two"]);
    assert.equal((await repo.get<any>("control", "catalog")).references.miding?.count ?? 0, categoryRefs - 1);
    assert.equal((await repo.get<any>("control", "code-ZJ-D-S-A")).next, 2);
    const events = [...repo.data].filter(([k]) => k.startsWith("audit/")).map(([, v]: any) => v);
    assert.equal(events.filter((e) => e.action === "REMOVE_PRODUCT").length, 1);
    assert.equal(events.find((e) => e.action === "REMOVE_PRODUCT")?.reason, body.reason);
    const after = structuredClone(repo.data);
    assert.deepEqual(await backend.removeProduct(id, body, key, "retry"), removed);
    assert.deepEqual(repo.data, after);
    assert.deepEqual(removedFiles, ["private/raw/one", "private/preview/two"]);
    await assert.rejects(backend.removeProduct(id, body, randomUUID(), "again"), { status: 404 });
    const recreated = await backend.create({ ...createBody("CLOUD-REMOVE"), categoryId: "miding", templateId: "software", sequence: 1 }, randomUUID(), "recreate");
    assert.equal(recreated.productId, id);
    const plan = await verifyProductIndexes(repo);
    assert.equal(plan.updates.length, 0);
  });
});

test("Cloud upload commit rechecks a product removed while its private object was being stored", async () => {
  const repo = new Harness(); await bootstrapTestRepo(repo, "test-admin"); let created: any, removedObject = false;
  const backend = new DomainBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { await backend.removeProduct(created.productId, { expectedDraftVersion: 1, expectedPublicationVersion: 0, reason: "上传过程中移除", confirmation: created.productId, confirmed: true }, randomUUID(), "remove-during-upload"); return "private-test-object"; }, async download() { throw new Error("unused"); }, async remove() { removedObject = true; } });
  await actorContext.run(await backend.authenticate("test"), async () => {
    created = await backend.create(createBody("CLOUD-REMOVE-RACE"), randomUUID(), "create");
    const bytes = await readFile("tests/fixtures/validation/sample-v1.pdf"), intent = await backend.createUpload({ productId: created.productId, purpose: "preview", fileName: "pending.pdf", contentType: "application/pdf", size: bytes.length }, randomUUID());
    const request = Readable.from([bytes]) as any; request.headers = { "content-type": "application/octet-stream" };
    await assert.rejects(backend.put(intent.uploadId, request), { status: 409 }); assert.equal(removedObject, true);
    assert.equal(await repo.get<any>("assets", intent.assetId), undefined);
    await assert.rejects(backend.complete(intent.uploadId), { status: 404 });
  });
});

test("Cloud restore-draft persists the draft state and keeps idempotent replays", async () => {
  const repo = new Harness(); await bootstrapTestRepo(repo, "test-admin");
  const backend = new DomainBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { throw new Error("unused"); }, async download() { throw new Error("unused"); } });
  await actorContext.run(await backend.authenticate("test"), async () => {
    const created = await backend.create(createBody("CLOUD-RESTORE"), randomUUID(), "create");
    const id = created.productId;
    const master = await repo.get<any>("products", id);
    master.publicationState = "OFFLINE"; master.publicationVersion = 3;
    await repo.set("products", id, master);
    const body = { expectedDraftVersion: 1, expectedPublicationVersion: 3, reason: "恢复为草稿", confirmed: true as const };
    const key = randomUUID();
    const restored = await backend.restoreDraft(id, body, key, "restore");
    assert.equal(restored.publicationState, "DRAFT");
    assert.equal(restored.publicationVersion, 4);
    const after = structuredClone(repo.data);
    const replay = await backend.restoreDraft(id, body, key, "retry");
    assert.equal(replay.publicationState, "DRAFT");
    assert.deepEqual(repo.data, after);
    const events = [...repo.data].filter(([k]) => k.startsWith("audit/")).map(([, v]: any) => v);
    assert.equal(events.filter((e) => e.action === "RESTORE_DRAFT").length, 1);
    assert.equal(events.find((e) => e.action === "RESTORE_DRAFT")?.reason, "恢复为草稿");
  });
});
test("Cloud renumber migrates documents and indexes atomically and keeps the public UUID", async () => {
  const repo = new Harness(); await bootstrapTestRepo(repo, "test-admin");
  const backend = new DomainBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { throw new Error("unused"); }, async download() { throw new Error("unused"); } });
  await actorContext.run(await backend.authenticate("test"), async () => {
    const created = await backend.create({ ...createBody("CLOUD-RENUMBER"), categoryId: "miding", templateId: "software" }, randomUUID(), "create");
    const oldId = created.productId;
    assert.equal(oldId, "ZJ-D-S-A-001");
    const publicId = (await repo.get<any>("products", oldId)).publicId;
    const releaseId = randomUUID();
    await repo.set("releases", releaseId, {
      id: releaseId,
      productId: oldId,
      sequence: 1,
      content: { ...created.content, categoryId: "miding", templateId: "software" },
      publishedAt: new Date().toISOString(),
      publishedBy: "test-admin",
    });
    const original = await repo.get<any>("products", oldId);
    original.lastReleaseId = releaseId;
    original.releaseSequence = 1;
    await repo.set("products", oldId, original);
    const historicalModelId = "model-" + createHash("sha256").update(normalizedModel("HISTORICAL-MODEL")).digest("hex");
    await repo.set("control", historicalModelId, { productId: oldId });
    const body = { expectedDraftVersion: created.draftVersion, categoryId: "miyi", productType: "HARDWARE" as const, ownership: "PARTNER" as const, sequence: 7, reason: "按对照表改号" };
    const before = structuredClone(repo.data);
    repo.fail = true;
    await assert.rejects(backend.renumberProduct(oldId, body, randomUUID(), "renumber"), /INJECTED/);
    assert.deepEqual(repo.data, before);
    repo.fail = false;
    const renamed = await backend.renumberProduct(oldId, body, randomUUID(), "renumber");
    assert.equal(renamed.productId, "ZJ-Y-H-B-007");
    assert.equal(await repo.get("products", oldId), undefined);
    assert.equal(await repo.get("drafts", oldId), undefined);
    assert.equal(await repo.get("history", oldId), undefined);
    const master = await repo.get<any>("products", renamed.productId);
    assert.equal(master.publicId, publicId);
    assert.equal(master.lastReleaseId, releaseId);
    assert.equal((await repo.get<any>("releases", releaseId)).productId, "ZJ-Y-H-B-007");
    assert.equal((await repo.get<any>("control", historicalModelId)).productId, "ZJ-Y-H-B-007");
    assert.equal((await repo.get<any>("control", "public-" + publicId)).productId, renamed.productId);
    const modelId = "model-" + createHash("sha256").update(normalizedModel("CLOUD-RENUMBER")).digest("hex");
    assert.equal((await repo.get<any>("control", modelId)).productId, renamed.productId);
    assert.equal((await repo.get<any>("control", "code-ZJ-Y-H-B")).next, 8);
    assert.equal((await repo.get<any>("control", "code-ZJ-D-S-A")).next, 2);
    await assert.rejects(backend.create({ ...createBody("CLOUD-RENUMBER-2"), categoryId: "miyi", templateId: "software", productType: "HARDWARE", ownership: "PARTNER", sequence: 7 }, randomUUID(), "occupied"), { status: 409, code: "CODE_CONFLICT" });
  });
});
