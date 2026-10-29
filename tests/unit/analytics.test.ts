import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, writeFile, rm } from "node:fs/promises";
import { MockStore } from "../../services/mock-api/src/store";
import { mockBackend } from "../../services/mock-api/src/backend";
import { makeApiServer } from "../../services/domain/src/http";
import { sourceIp, recentAnalytics, analyticsRecord, ANALYTICS_RETENTION_MS, restoreAnalyticsRecord } from "../../services/domain/src/analytics";
import { CloudBackend } from "../../services/api/src/cloud-backend";
import { initialize } from "../../services/api/src/initialize";
import { actorContext } from "../../services/domain/src/identity";
import type { Repository, Transaction } from "../../services/api/src/repository";
import type { IncomingMessage } from "node:http";

async function fixture() {
  const store = new MockStore(undefined, true), product = store.products.get("ZJ-001")!;
  const releaseId = randomUUID(), materialId = randomUUID(), versionId = randomUUID();
  const bytes = await readFile(new URL("../fixtures/validation/sample-v1.pdf", import.meta.url));
  const intent = store.assets.create({ productId: product.productId, purpose: "preview", fileName: "sample.pdf", contentType: "application/pdf", size: bytes.length });
  const upload = store.assets.get(intent.uploadId);
  await writeFile(upload.path, bytes); Object.assign(upload, { status: "READY", mimeType: "application/pdf", size: bytes.length, checksum: "test", pageCount: 2 });
  const material = { materialId, versionId, name: "统计测试资料", kind: "brochure" as const, category: "promotional" as const, subCategory: "deck" as const, versionLabel: "V1.0", preview: { kind: "pdf" as const, assetId: intent.assetId, pageCount: 2 } };
  product.publicId = randomUUID(); product.publicationState = "PUBLISHED"; product.activeReleaseId = releaseId; product.lastReleaseId = releaseId; product.draft.materials = [material];
  store.releases.set(releaseId, { id: releaseId, productId: product.productId, content: structuredClone(product.draft), sequence: 1, publishedAt: new Date().toISOString(), publishedBy: "test" });
  return { store, product, material, releaseId, body: { productId: product.publicId, materialId, versionId, releaseId, viewId: randomUUID(), client: "H5" as const } };
}

test("analytics API enforces admin controls, valid current material, view deduplication, range exclusion and immediate stop", async () => {
  const f = await fixture(), backend = mockBackend(f.store, { ENABLE_MOCK_ROLES: "true" });
  const server = makeApiServer(backend); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  async function call(path: string, method = "GET", data?: unknown, role?: string, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method, headers: { ...(role ? { Authorization: `Bearer local-${role}` } : {}), ...(data ? { "Content-Type": "application/json" } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert.equal((await call("/admin/analytics/summary", "GET", undefined, "admin")).status, 403);
    const notice = await call("/catalog/analytics"); assert.equal(notice.body.data.viewEnabled, false); assert.equal(notice.body.data.version, undefined);
    assert.equal((await call("/catalog/analytics/views", "POST", f.body)).status, 200);
    for (const role of [undefined, "mock", "sales"]) {
      assert.equal((await call("/admin/analytics/events", "GET", undefined, role)).status, role ? 403 : 401);
      assert.equal((await call("/admin/analytics/settings", "PUT", { expectedVersion: 0, viewEnabled: true, downloadEnabled: true, dashboardEnabled: true }, role)).status, role ? 403 : 401);
    }
    assert.equal((await call("/admin/analytics/settings", "PUT", { expectedVersion: 0, viewEnabled: true, downloadEnabled: true, dashboardEnabled: true }, "admin")).status, 200);
    assert.equal((await call("/admin/analytics/settings", "PUT", { expectedVersion: 0, viewEnabled: true, downloadEnabled: true, dashboardEnabled: true }, "admin")).status, 409);
    assert.equal((await call("/catalog/analytics/views", "POST", { ...f.body, sharer: "伪造身份" })).status, 400);
    assert.equal((await call("/catalog/analytics/views", "POST", { ...f.body, versionId: randomUUID() })).status, 409);
    for (let i = 0; i < 3; i++) assert.equal((await call("/catalog/analytics/views", "POST", f.body, undefined, { "X-Forwarded-For": "203.0.113.45" })).status, 200);
    let events = (await call("/admin/analytics/events", "GET", undefined, "admin")).body.data;
    assert.equal(events.length, 1); assert.equal(events[0].sharer, null); assert.equal(events[0].sourceIp, "127.0.0.1"); assert.equal(events[0].actorName, null);
    const path = `/sales/catalog/products/${f.product.publicId}/materials/${f.material.materialId}/source?releaseId=${f.releaseId}&versionId=${f.material.versionId}`;
    for (let i = 0; i < 3; i++) { const response = await fetch(base + path, { headers: { Authorization: "Bearer local-sales", Range: "bytes=0-15" } }); assert.equal(response.status, 206); await response.arrayBuffer(); }
    assert.equal((await call("/admin/analytics/summary", "GET", undefined, "admin")).body.data.downloads, 0);
    const download = await fetch(base + path, { headers: { Authorization: "Bearer local-sales" } }); assert.equal(download.status, 200); await download.arrayBuffer();
    for (let i = 0; i < 20; i++) { events = (await call("/admin/analytics/events", "GET", undefined, "admin")).body.data; if (events.length === 2) break; await new Promise((resolve) => setTimeout(resolve, 5)); }
    assert.equal(events.length, 2); assert.equal(events.find((event: { kind: string }) => event.kind === "DOWNLOAD").actorName, "本地虚构销售身份");
    assert.equal((await call("/admin/analytics/events?from=2026-02-31", "GET", undefined, "admin")).status, 400);
    const summary = (await call("/admin/analytics/summary", "GET", undefined, "admin")).body.data; assert.equal(summary.views, 1); assert.equal(summary.downloads, 1);
    assert.equal((await call("/admin/analytics/events?kind=DOWNLOAD&client=SALES_PC", "GET", undefined, "admin")).body.data.length, 1);
    const active = f.store.releases.get(f.releaseId)!; active.content.materials[0].category = "technical"; active.content.materials[0].subCategory = "manual";
    assert.equal((await call("/catalog/analytics/views", "POST", { ...f.body, viewId: randomUUID() })).status, 404);
    active.content.materials[0].category = "promotional"; active.content.materials[0].subCategory = "deck";
    assert.equal((await call("/admin/analytics/settings", "PUT", { expectedVersion: 1, viewEnabled: false, downloadEnabled: false, dashboardEnabled: false }, "admin")).status, 200);
    await call("/catalog/analytics/views", "POST", { ...f.body, viewId: randomUUID() });
    assert.equal((await call("/admin/analytics/events", "GET", undefined, "admin")).body.data.length, 2);
    const clock = Date.now; Date.now = () => clock() + ANALYTICS_RETENTION_MS + 1;
    try { assert.deepEqual(await actorContext.run(f.store.users.get("mock-admin")!, () => backend.analyticsEvents()), []); }
    finally { Date.now = clock; }
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(f.store.assets.directory, { recursive: true, force: true }); }
});

test("analytics limits new events by observed IP while deduplicated retries remain harmless", async () => {
  const f = await fixture(), backend = mockBackend(f.store, { ENABLE_MOCK_ROLES: "true" });
  try {
    await actorContext.run(f.store.users.get("mock-admin")!, () => backend.writeAnalyticsSettings({ expectedVersion: 0, viewEnabled: true, downloadEnabled: false, dashboardEnabled: false }, "enable"));
    for (let i = 0; i < 60; i++) await backend.submitAnalyticsView({ ...f.body, viewId: randomUUID() }, "198.51.100.7");
    await assert.rejects(async () => backend.submitAnalyticsView({ ...f.body, viewId: randomUUID() }, "198.51.100.7"), (error: unknown) => (error as { status?: number }).status === 429);
    await backend.submitAnalyticsView(f.body, "198.51.100.8");
    await backend.submitAnalyticsView(f.body, "198.51.100.8");
    assert.equal((await actorContext.run(f.store.users.get("mock-admin")!, () => backend.analyticsEvents())).length, 61);
  } finally { await rm(f.store.assets.directory, { recursive: true, force: true }); }
});

test("source IP trusts only exact proxy peers and rejects arbitrary or malformed forwarding", () => {
  const req = (peer: string, header?: string) => ({ socket: { remoteAddress: peer }, headers: header ? { "x-forwarded-for": header } : {} }) as IncomingMessage;
  assert.equal(sourceIp(req("::ffff:127.0.0.1", "203.0.113.1")), "127.0.0.1");
  assert.equal(sourceIp(req("127.0.0.1", "203.0.113.8, 10.0.0.2"), ["127.0.0.1", "10.0.0.2"]), "203.0.113.8");
  assert.equal(sourceIp(req("127.0.0.1", "198.51.100.9, 203.0.113.8"), ["127.0.0.1"]), "203.0.113.8");
  assert.equal(sourceIp(req("127.0.0.1", "bad-ip"), ["127.0.0.1"]), "127.0.0.1");
});

class AnalyticsRepository implements Repository {
  data = new Map<string, unknown>(); tail = Promise.resolve();
  async get<T>(collection: string, id: string) { return structuredClone(this.data.get(collection + "/" + id)) as T | undefined; }
  async set(collection: string, id: string, value: unknown) { this.data.set(collection + "/" + id, structuredClone(value)); }
  async list<T>(collection: string) { if (collection === "analytics") throw new Error("General collection listing is intentionally not used for analytics"); return [...this.data].filter(([key]) => key.startsWith(collection + "/")).map(([, value]) => structuredClone(value) as T); }
  async *scan<T>(collection: string) { for (const [key, value] of this.data) if (key.startsWith(collection + "/")) yield structuredClone(value) as T; }
  async pruneExpired(collection: string, before: Date) { for (const [key, value] of this.data) if (key.startsWith(collection + "/") && new Date((value as { expiresAt: Date }).expiresAt).getTime() <= before.getTime()) this.data.delete(key); }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>) { const previous = this.tail; let release!: () => void; this.tail = new Promise<void>((resolve) => { release = resolve; }); await previous; const snapshot = structuredClone(this.data); try { return await fn(this); } catch (error) { this.data = snapshot; throw error; } finally { release(); } }
}

test("Cloud analytics transaction harness persists switch, concurrent dedup and expiration without a real cloud", async () => {
  const f = await fixture(), repo = new AnalyticsRepository();
  try {
    await initialize(repo, "analytics-admin");
    const { draft, ...product } = f.product;
    await repo.set("products", product.productId, product); await repo.set("drafts", product.productId, { content: draft }); await repo.set("releases", f.releaseId, f.store.releases.get(f.releaseId)); await repo.set("control", "public-" + product.publicId, { productId: product.productId });
    const backend = new CloudBackend(repo, { subject: async () => "analytics-admin" }, { upload: async () => { throw new Error("not used"); }, download: async () => { throw new Error("not used"); } });
    const me = await backend.authenticate("Bearer test");
    await actorContext.run(me, () => backend.writeAnalyticsSettings({ expectedVersion: 0, viewEnabled: true, downloadEnabled: true, dashboardEnabled: true }, "test"));
    await Promise.all(Array.from({ length: 8 }, () => backend.submitAnalyticsView(f.body, "192.0.2.8")));
    let events = await actorContext.run(me, () => backend.analyticsEvents()); assert.equal(events.length, 1); assert.equal(events[0].sharer, null);
    await assert.rejects(() => backend.analyticsEvents());
    const old = analyticsRecord({ kind: "VIEW", ...f.body, sourceIp: "192.0.2.9", eventKey: randomUUID() }, { productId: product.productId, productName: "旧资料", materialName: "旧资料", versionLabel: "V1.0" }, Date.now() - ANALYTICS_RETENTION_MS - 1000);
    const serialized = JSON.parse(JSON.stringify(old));
    assert.equal(restoreAnalyticsRecord(serialized), undefined);
    const retained = JSON.parse(JSON.stringify(analyticsRecord({ kind: "VIEW", ...f.body, sourceIp: "192.0.2.9", eventKey: randomUUID() }, { productId: product.productId, productName: "测试", materialName: "资料", versionLabel: "V1.0" })));
    assert.ok(restoreAnalyticsRecord(retained)?.expiresAt instanceof Date);
    assert.throws(() => restoreAnalyticsRecord({ ...retained, expiresAt: new Date(Date.now() + 365 * 86400000).toISOString() }), /INVALID_ANALYTICS_RETENTION/);
    await repo.set("analytics", "expired", old);
    assert.equal(recentAnalytics([old]).length, 0);
    events = await actorContext.run(me, () => backend.analyticsEvents()); assert.equal(events.length, 1); assert.equal(await repo.get("analytics", "expired"), undefined);
    const restart = new CloudBackend(repo, { subject: async () => "analytics-admin" }, { upload: async () => "unused", download: async () => {} });
    assert.equal((await restart.analyticsSettings()).viewEnabled, true);
    await actorContext.run(me, () => restart.writeAnalyticsSettings({ expectedVersion: 1, viewEnabled: false, downloadEnabled: false, dashboardEnabled: false }, "test-stop"));
    await restart.submitAnalyticsView({ ...f.body, viewId: randomUUID() }, "192.0.2.8");
    assert.equal((await actorContext.run(me, () => restart.analyticsEvents())).length, 1);
    const retainedEvent = analyticsRecord({ kind: "VIEW", ...f.body, sourceIp: "192.0.2.9", eventKey: randomUUID() }, { productId: product.productId, productName: "容量测试", materialName: "虚构资料", versionLabel: "V1.0" });
    for (let i = 0; i < 10001; i++) repo.data.set("analytics/bulk-" + i, { ...retainedEvent, eventId: "bulk-" + i });
    assert.equal((await actorContext.run(me, () => restart.analyticsEvents())).length, 10002);
  } finally { await rm(f.store.assets.directory, { recursive: true, force: true }); }
});
