import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPublicIdPlan, applyPublicIdMigration } from "../../services/api/src/public-id-migration";
import { initialize } from "../../services/api/src/initialize";
import { validateBackup } from "../../services/api/src/backup-validation";
import { collections, type Repository, type Transaction } from "../../services/api/src/repository";
import type { ProductRecord } from "@zj/contracts";
import { CloudBackend } from "../../services/api/src/cloud-backend";

class Harness implements Repository {
  data = new Map<string, any>();
  fail = false;
  async get<T>(collection: string, id: string) { return structuredClone(this.data.get(collection + "/" + id)) as T | undefined; }
  async set(collection: string, id: string, value: unknown) { this.data.set(collection + "/" + id, structuredClone(value)); }
  async list<T>(collection: string) { return [...this.data].filter(([k]) => k.startsWith(collection + "/")).map(([,v]) => structuredClone(v) as T); }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>) { const before = structuredClone(this.data); try { const result = await fn(this); if (this.fail) throw new Error("INJECTED_FAILURE"); return result; } catch (e) { this.data = before; throw e; } }
}

test("public UUID migration fills all 27 old codes, preserves snapshots, rolls back and survives backup validation", async () => {
  const repo = new Harness();
  await initialize(repo, "test-only-subject");
  const state = await repo.get<any>("control", "state");
  const old = await repo.get<any>("products", "ZJ-001"), draft = await repo.get<any>("drafts", "ZJ-001");
  const releaseId = randomUUID();
  const content = { ...draft.content, name: "【验证数据】旧发布迁移样例", summary: "仅用于内存替身迁移验证" };
  await repo.set("drafts", "ZJ-001", { ...draft, content });
  await repo.set("products", "ZJ-001", { ...old, publicationState: "PUBLISHED", activeReleaseId: releaseId, lastReleaseId: releaseId, releaseSequence: 1 });
  await repo.set("releases", releaseId, { id: releaseId, productId: "ZJ-001", sequence: 1, content, publishedAt: new Date().toISOString(), publishedBy: "test-only-subject" });
  const originals = await repo.list<Omit<ProductRecord, "draft">>("products");
  const drafts = structuredClone(await repo.list("drafts"));
  const releases = structuredClone(await repo.list("releases"));
  const plan = createPublicIdPlan(originals, state.revision);
  assert.equal(plan.entries.length, 27);
  assert.equal(new Set(plan.entries.map(e => e.publicId)).size, 27);
  assert.ok(plan.entries.every(e => !e.publicId.includes("ZJ")));
  await assert.rejects(applyPublicIdMigration(repo, plan), /MAINTENANCE/);
  await repo.set("control", "state", { ...state, maintenance: true });
  repo.fail = true;
  await assert.rejects(applyPublicIdMigration(repo, plan), /INJECTED_FAILURE/);
  assert.ok((await repo.list<any>("products")).every(p => !p.publicId));
  repo.fail = false;
  const result = await applyPublicIdMigration(repo, plan);
  assert.equal(result.migrated, 27);
  assert.deepEqual(await repo.list("drafts"), drafts);
  assert.deepEqual(await repo.list("releases"), releases);
  assert.deepEqual((await repo.list<any>("products")).map(({publicId,...p}) => p), originals);
  const backend = new CloudBackend(repo, { subject: async () => "test-only-subject" }, { upload: async () => { throw new Error("NO_STORAGE"); }, download: async () => { throw new Error("NO_STORAGE"); } });
  const publicId = plan.entries.find(entry => entry.productId === "ZJ-001")!.publicId;
  assert.equal((await backend.publicProduct(publicId)).name, content.name);
  await assert.rejects(backend.publicProduct("ZJ-001"), { status: 404 });
  await assert.rejects(applyPublicIdMigration(repo, plan), /STALE/);
  const updatedState = await repo.get<any>("control", "state");
  const repeated = createPublicIdPlan(await repo.list("products"), updatedState.revision);
  assert.deepEqual(repeated.entries.map(e => e.publicId), plan.entries.map(e => e.publicId));
  assert.equal((await applyPublicIdMigration(repo, repeated)).migrated, 0);
  const records = Object.fromEntries(collections.filter(c => c !== "rates").map(c => [c, [...repo.data].filter(([k]) => k.startsWith(c + "/")).map(([k,v]) => ({ _id: k.slice(c.length + 1), ...v }))]));
  const backup = { format: 1, environment: "isolated-only", revision: updatedState.revision + 1, records, files: [] };
  assert.equal(validateBackup(backup).records.products.length, 27);
  const wrongDocumentId = structuredClone(backup);
  wrongDocumentId.records.products[0].productId = "ZJ-DOCUMENT-MISMATCH";
  assert.throws(() => validateBackup(wrongDocumentId), /PRODUCT_DOCUMENT_ID_MISMATCH/);
  const restored = validateBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(restored.records.products.map(p => p.publicId), backup.records.products.map(p => p.publicId));
  const duplicate = structuredClone(backup);
  duplicate.records.products[1].publicId = duplicate.records.products[0].publicId;
  assert.throws(() => validateBackup(duplicate), /PUBLIC_ID/);
});

test("migration rejects duplicates, malformed IDs, tampered mappings, stale state and index collisions", async () => {
  const repo = new Harness(); await initialize(repo, "test-only-subject");
  const state = await repo.get<any>("control", "state");
  const products = await repo.list<Omit<ProductRecord,"draft">>("products");
  const duplicate = structuredClone(products); duplicate[0].publicId = duplicate[1].publicId = randomUUID();
  assert.throws(() => createPublicIdPlan(duplicate, state.revision), /DUPLICATE_PUBLIC_ID/);
  const malformed = structuredClone(products); malformed[0].publicId = "ZJ-D-S-A-001";
  assert.throws(() => createPublicIdPlan(malformed, state.revision), /INVALID_PUBLIC_ID/);
  const plan = createPublicIdPlan(products, state.revision);
  await repo.set("control", "state", { ...state, maintenance: true });
  const tampered = structuredClone(plan); tampered.entries[1].publicId = tampered.entries[0].publicId;
  await assert.rejects(applyPublicIdMigration(repo, tampered), /INVALID_MIGRATION_MAPPING/);
  await repo.set("control", "public-" + plan.entries[0].publicId, { productId: "OTHER" });
  await assert.rejects(applyPublicIdMigration(repo, plan), /INDEX_CONFLICT/);
  await repo.set("products", products[0].productId, { ...products[0], draftVersion: 999 });
  await assert.rejects(applyPublicIdMigration(repo, plan), /STALE/);
});

test("an existing public index cannot make a duplicate UUID accessible", async () => {
  const repo = new Harness(); await initialize(repo, "test-only-subject");
  const products = await repo.list<Omit<ProductRecord, "draft">>("products");
  const id = randomUUID();
  await repo.set("products", products[0].productId, { ...products[0], publicId: id, publicationState: "PUBLISHED" });
  await repo.set("products", products[1].productId, { ...products[1], publicId: id.toUpperCase() });
  await repo.set("control", "public-" + id, { productId: products[0].productId });
  const backend = new CloudBackend(repo, { subject: async () => "test-only-subject" }, { upload: async () => { throw new Error("NO_STORAGE"); }, download: async () => { throw new Error("NO_STORAGE"); } });
  await assert.rejects(backend.resolvePublicId(id), { status: 404 });
  await assert.rejects(backend.publicProduct(products[0].productId), { status: 404 });
});
