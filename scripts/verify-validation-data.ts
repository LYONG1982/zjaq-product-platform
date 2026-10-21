import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "../packages/api-client/src/index";
import seeds from "../data/products.master.seed.json";
const base = new URL(
  process.env.DEMO_API_BASE ?? "http://127.0.0.1:3100/api/v1",
);
assert.ok(
  base.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(base.hostname) &&
    base.pathname === "/api/v1" &&
    !base.username &&
    !base.password &&
    !base.search &&
    !base.hash,
  "Only explicit loopback Mock endpoints are allowed",
);
const health = await fetch(new URL("/health", base)).then((r) => r.json());
assert.equal(health.provider, "mock");
assert.equal(health.scope, "TASK-02/03");
assert.match(health.sessionId, /^[a-f0-9-]{36}$/);
const api = createClient(base.toString(), undefined, "local-mock");
for (const original of seeds) {
  const actual = (await api.draft(original.productId)).data;
  assert.equal(actual.publicationState, "DRAFT");
  assert.equal(actual.draftVersion, 1);
  assert.equal(actual.publicationVersion, 0);
  assert.deepEqual(actual.content, original.draft);
}
const journal = JSON.parse(
  await readFile(
    new URL(
      "../work/validation-data/" + health.sessionId + ".json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const records = [];
for (const [kind, record] of Object.entries(journal.records) as [
  string,
  { id: string },
][]) {
  const d = (await api.draft(record.id)).data;
  const res = await fetch(base + "/catalog/products/" + record.id);
  const shouldBePublic = ["software", "device"].includes(kind);
  assert.equal(res.status, shouldBePublic ? 200 : 404);
  let publishedMaterialVersion = null,
    previewKind = null,
    pages = null;
  if (shouldBePublic) {
    const publicProduct = (await res.json()).data;
    assert.ok(!JSON.stringify(publicProduct).includes("sourceAssetId"));
    const m = publicProduct.materials[0];
    publishedMaterialVersion = m.versionLabel;
    previewKind = m.previewKind;
    const manifest = (
      await fetch(new URL(m.previewPath, base)).then((r) => r.json())
    ).data;
    pages = manifest.pageCount;
    for (const part of manifest.parts) {
      const bytes = await fetch(new URL(part.path, base), {
        headers: { Range: "bytes=0-4" },
      });
      assert.equal(bytes.status, 206);
      assert.equal(bytes.headers.get("cache-control"), "no-store");
      await bytes.arrayBuffer();
    }
    if (kind === "software") {
      assert.equal(m.versionLabel, "v1");
      assert.equal(d.content.materials[0].versionLabel, "v2");
      assert.equal(d.hasUnpublishedChanges, true);
      assert.ok(!publicProduct.summary.includes("尚未发布的第二版草稿"));
    }
    if (kind === "device") assert.equal(manifest.parts.length, 3);
  }
  assert.equal(
    d.publicationState,
    shouldBePublic ? "PUBLISHED" : kind === "ai" ? "OFFLINE" : "DRAFT",
  );
  records.push({
    productId: d.productId,
    name: d.content.name,
    template: kind,
    state: d.publicationState,
    draftVersion: d.draftVersion,
    publicationVersion: d.publicationVersion,
    hasUnpublishedChanges: d.hasUnpublishedChanges,
    draftMaterialVersion: d.content.materials[0].versionLabel,
    publishedMaterialVersion,
    previewKind,
    pages,
  });
}
assert.equal(records.length, 4);
const total = (await api.products({ limit: 100 })).data.length;
const publicTotal = (await api.publicProducts({ limit: 100 })).data.length;
console.log(
  JSON.stringify(
    {
      target: base.origin,
      sessionId: health.sessionId,
      originalDraftsUnchanged: 27,
      adminCountOnFirstPage: total,
      publicCountOnFirstPage: publicTotal,
      records,
      result: "PASS",
      scope: "Live local Mock verification; no cloud or device acceptance",
    },
    null,
    2,
  ),
);
