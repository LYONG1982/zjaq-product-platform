import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { CloudBackend } from "../../services/api/src/cloud-backend";
import { initialize } from "../../services/api/src/initialize";
import type {
  Repository,
  Transaction,
} from "../../services/api/src/repository";
import { actorContext } from "../../services/domain/src/identity";
import { CloudBaseIdentity } from "../../services/api/src/auth";
class TransactionHarness implements Repository {
  data = new Map<string, unknown>();
  private tail = Promise.resolve();
  fail = false;
  async get<T>(c: string, id: string) {
    return structuredClone(this.data.get(c + "/" + id)) as T | undefined;
  }
  async set(c: string, id: string, value: unknown) {
    this.data.set(c + "/" + id, structuredClone(value));
  }
  async list<T>(c: string) {
    return [...this.data]
      .filter(([k]) => k.startsWith(c + "/"))
      .map(([, v]) => structuredClone(v) as T);
  }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await previous;
    const snapshot = new Map(structuredClone([...this.data]));
    try {
      const result = await fn(this);
      if (this.fail) throw new Error("INJECTED_COMMIT_FAILURE");
      return result;
    } catch (e) {
      this.data = snapshot;
      throw e;
    } finally {
      release();
    }
  }
}
const storage = {
  upload: async () => {
    throw new Error("No object service in transaction harness");
  },
  download: async () => {
    throw new Error("No object service in transaction harness");
  },
};
test("CloudBase adapter command contract: persistence, idempotency, rollback and management concurrency using an in-memory transaction harness", async () => {
  const repo = new TransactionHarness();
  await initialize(repo, "trusted-admin");
  const identity = {
    subject: async (header: string | undefined) => {
      assert.equal(header, "Bearer valid-test-only");
      return "trusted-admin";
    },
  };
  let backend = new CloudBackend(repo, identity, storage);
  const me = await backend.authenticate("Bearer valid-test-only");
  await actorContext.run(me, async () => {
    const key = randomUUID(),
      body = {
        name: "契约测试",
        categoryId: "ai",
        templateId: "ai",
        templateVersion: 1,
        model: "MODEL-" + randomUUID(), productType: "SOFTWARE" as const, ownership: "SELF_DEVELOPED" as const,
        owner: "测试",
      };
    const created = await backend.create(body, key, "request");
    assert.equal(created.productId, "ZJ-A-S-A-001");
    backend = new CloudBackend(repo, identity, storage);
    assert.equal(
      (await backend.create(body, key, "request-retry")).productId,
      created.productId,
    );
    assert.equal((await repo.list("audit")).length, 1);
    assert.equal((await backend.draft(created.productId)).draftVersion, 1);
    repo.fail = true;
    await assert.rejects(
      backend.save(
        created.productId,
        {
          expectedDraftVersion: 1,
          content: { ...created.content, summary: "回滚内容" },
        },
        "failed",
      ),
    );
    repo.fail = false;
    assert.equal((await backend.draft(created.productId)).content.summary, "");
    assert.equal((await repo.list("audit")).length, 1);
    const results = await Promise.allSettled([
      backend.save(
        created.productId,
        {
          expectedDraftVersion: 1,
          content: { ...created.content, summary: "A" },
        },
        "A",
      ),
      backend.save(
        created.productId,
        {
          expectedDraftVersion: 1,
          content: { ...created.content, summary: "B" },
        },
        "B",
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const c = (await backend.categories()).find((c) => c.id === "ai")!;
    await assert.rejects(
      backend.writeCategory(
        c.id,
        {
          name: c.name,
          shortName: c.shortName,
          sortOrder: c.sortOrder,
          enabled: false,
          defaultTemplateId: c.defaultTemplateId,
          allowedTemplateIds: c.allowedTemplateIds,
          expectedVersion: c.version,
        },
        "category",
      ),
    );
    const second = await backend.writeUser(
      undefined,
      {
        subjectId: "second-admin",
        displayName: "二号管理员",
        role: "ADMIN",
        enabled: true,
      },
      "second",
    );
    const first = (await backend.users()).find(
      (u) => u.subjectId === "trusted-admin",
    )!;
    const writes = await Promise.allSettled([
      backend.writeUser(
        first.userId,
        {
          subjectId: first.subjectId,
          displayName: first.displayName,
          role: "ADMIN",
          enabled: false,
          expectedVersion: first.version,
        },
        "disable-first",
      ),
      backend.writeUser(
        second.userId,
        {
          subjectId: second.subjectId,
          displayName: second.displayName,
          role: "ADMIN",
          enabled: false,
          expectedVersion: second.version,
        },
        "disable-second",
      ),
    ]);
    assert.equal(writes.filter((r) => r.status === "fulfilled").length, 1);
  });
  const users = await repo.list<{ enabled: boolean; role: string }>("users");
  assert.equal(users.filter((u) => u.enabled && u.role === "ADMIN").length, 1);
  await assert.rejects(initialize(repo, "replacement-admin"));
});
test("real identity rejects local tokens before network and accepts only the exact configured official origin", async () => {
  assert.throws(() => new CloudBaseIdentity("example-env", "http://localhost"));
  assert.throws(
    () => new CloudBaseIdentity("example-env", "https://untrusted.example"),
  );
  const auth = new CloudBaseIdentity(
    "example-env",
    "https://example-env.api.tcloudbasegateway.com",
  );
  await assert.rejects(auth.subject("Bearer local-mock"));
  await assert.rejects(auth.subject("Bearer local-admin"));
});

test("CloudBase adapter file and publication lifecycle uses durable metadata and a private object harness", async () => {
  const { writeFile, readFile } = await import("node:fs/promises");
  const { makeApiServer } = await import("../../services/domain/src/http");
  const { createClient } = await import("../../packages/api-client/src/index");
  const { AppError } = await import("../../services/domain/src/errors");
  const repo = new TransactionHarness();
  await initialize(repo, "trusted-admin");
  const objects = new Map<string, Buffer>();
  let failUploadRead = false;
  let failedUploadPath = "";
  const objectStorage = {
    async upload(path: string, filePath: string) {
      const id = "private-object:" + path;
      if (failUploadRead) {
        failUploadRead = false;
        failedUploadPath = filePath;
        throw new Error("ENOENT: simulated object upload source read failure");
      }
      objects.set(id, await readFile(filePath));
      return id;
    },
    async download(id: string, path: string) {
      const bytes = objects.get(id);
      if (!bytes) throw new Error("Object missing");
      await writeFile(path, bytes);
    },
  };
  const provider = {
    async subject(header: string | undefined) {
      if (header !== "Bearer verified-test-token")
        throw new AppError(401, "SESSION_EXPIRED", "测试身份不匹配");
      return "trusted-admin";
    },
  };
  const backend = new CloudBackend(repo, provider, objectStorage),
    server = makeApiServer(backend);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const a = server.address();
  assert.ok(a && typeof a === "object");
  const origin = "http://127.0.0.1:" + a.port,
    api = createClient(origin + "/api/v1", undefined, "verified-test-token");
  try {
    const d = (
      await api.create(
        {
          name: "适配器资料测试",
          owner: "测试",
          categoryId: "ai",
          templateId: "ai",
          templateVersion: 1,
        model: "MODEL-" + randomUUID(), productType: "SOFTWARE" as const, ownership: "SELF_DEVELOPED" as const,
        },
        randomUUID(),
      )
    ).data;
    const bytes = await readFile(
      "tests/fixtures/demo-ai/资料问答助手_Demo.pdf",
    );
    const upload = (
      await api.createUpload(
        {
          productId: d.productId,
          purpose: "preview",
          fileName: "test.pdf",
          contentType: "application/pdf",
          size: bytes.length,
        },
        randomUUID(),
      )
    ).data;
    await api.putBytes(upload.uploadId, new Blob([new Uint8Array(bytes)]));
    const ready = (await api.completeUpload(upload.uploadId)).data;
    assert.equal(ready.status, "READY");
    const failedUpload = (
      await api.createUpload(
        {
          productId: d.productId,
          purpose: "preview",
          fileName: "read-failure.pdf",
          contentType: "application/pdf",
          size: bytes.length,
        },
        randomUUID(),
      )
    ).data;
    failUploadRead = true;
    await assert.rejects(
      api.putBytes(
        failedUpload.uploadId,
        new Blob([new Uint8Array(bytes)]),
      ),
    );
    await assert.rejects((await import("node:fs/promises")).stat(failedUploadPath));
    const item = { id: "test", title: "测试", text: "测试描述" };
    const saved = (
      await api.save(d.productId, {
        expectedDraftVersion: 1,
        content: {
          ...d.content,
          tagline: "测试定位",
          summary: "测试说明",
          problemValues: [item],
          features: [item],
          scenarios: [item],
          boundaries: "仅测试",
          technical: {
            inputs: "示例",
            outputs: "草稿",
            humanReview: "人工确认",
          },
          materials: [
            {
              materialId: "test",
              versionId: "v1",
              versionLabel: "v1",
              kind: "brochure",
              category: "promotional",
              subCategory: "deck",
              name: "PDF 测试资料",
              preview: { kind: "pdf", assetId: ready.assetId, pageCount: 3 },
            },
          ],
        },
      })
    ).data;
    const pubBody = {
      expectedDraftVersion: saved.draftVersion,
      expectedPublicationVersion: 0,
      publicContentConfirmed: true as const,
    };
    repo.fail = true;
    await assert.rejects(api.publish(d.productId, pubBody, randomUUID()));
    repo.fail = false;
    assert.equal((await repo.list("releases")).length, 0);
    assert.equal((await api.draft(d.productId)).data.publicationState, "DRAFT");
    const key = randomUUID(),
      published = (await api.publish(d.productId, pubBody, key)).data;
    assert.equal(
      (await api.publish(d.productId, pubBody, key)).data.releaseId,
      published.releaseId,
    );
    assert.equal((await repo.list("releases")).length, 1);
    const quotaId = "upload-" + new Date().toISOString().slice(0, 10);
    assert.equal(
      (await repo.get<{ count: number }>("control", quotaId))?.count,
      2,
    );
    await repo.set("control", quotaId, { count: 500, bytes: bytes.length });
    await assert.rejects(
      api.createUpload(
        {
          productId: d.productId,
          purpose: "preview",
          fileName: "quota.pdf",
          contentType: "application/pdf",
          size: bytes.length,
        },
        randomUUID(),
      ),
      (e: unknown) => (e as { status: number }).status === 429,
    );
    assert.equal((await repo.list("assets")).length, 2);
    const publicId = (await repo.get<{ publicId: string }>("products", d.productId))!.publicId;
    const manifest = (await api.manifest(publicId, "test")).data;
    assert.ok(!JSON.stringify(manifest).includes("private-object"));
    const range = await fetch(origin + manifest.parts[0].path, {
      headers: { Range: "bytes=0-9" },
    });
    assert.equal(range.status, 206);
    assert.equal((await range.arrayBuffer()).byteLength, 10);
    await api.unpublish(
      d.productId,
      { expectedPublicationVersion: published.publicationVersion },
      randomUUID(),
    );
    assert.equal((await fetch(origin + manifest.parts[0].path)).status, 404);
    assert.equal((await repo.list("releases")).length, 1);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("initialization is atomic and backup validation rejects incomplete aggregates", async () => {
  const { validateBackup } =
    await import("../../services/api/src/backup-validation");
  const { collections } = await import("../../services/api/src/repository");
  const { seedOriginals } = await import("../../services/api/src/initialize");
  const repo = new TransactionHarness();
  repo.fail = true;
  await assert.rejects(initialize(repo, "trusted-admin"));
  assert.equal(repo.data.size, 0);
  repo.fail = false;
  await initialize(repo, "trusted-admin");
  const counter = await repo.get("control", "counter");
  assert.deepEqual(await seedOriginals(repo), {
    inserted: 0,
    skipped: 27,
    states: "DRAFT",
    existingRecordsPreserved: true,
  });
  assert.deepEqual(await repo.get("control", "counter"), counter);
  const records = Object.fromEntries(
    collections
      .filter((c) => c !== "rates")
      .map((c) => [
        c,
        [...repo.data]
          .filter(([k]) => k.startsWith(c + "/"))
          .map(([k, v]) => ({ _id: k.slice(c.length + 1), ...(v as object) })),
      ]),
  );
  const backup = {
    format: 1,
    environment: "source-test",
    revision: 1,
    records,
    files: [],
  };
  assert.equal(validateBackup(backup).records.products.length, 27);
  const legacy = structuredClone(backup);
  delete legacy.records.feedback;
  assert.deepEqual(validateBackup(legacy).records.feedback, []);
  assert.equal(Object.hasOwn(legacy.records, "feedback"), false);
  const missing = structuredClone(backup);
  missing.records.drafts.pop();
  assert.throws(() => validateBackup(missing), /MISSING_DRAFT/);
  assert.throws(
    () =>
      validateBackup({
        ...backup,
        files: [
          {
            assetId: "../../escape",
            fileId: "private",
            sha256: "a".repeat(64),
          },
        ],
      }),
    /INVALID_FILE_MANIFEST/,
  );
});

test("site banner changes persist and serialize under the CloudBase transaction harness", async () => {
  const repo = new TransactionHarness();
  await initialize(repo, "trusted-admin");
  const identity = { subject: async () => "trusted-admin" };
  let backend = new CloudBackend(repo, identity, storage);
  const actor = await backend.authenticate("test-only");
  const { readFile } = await import("node:fs/promises");
  const imageData = "data:image/png;base64," + (await readFile(new URL("../fixtures/validation/page-1.png", import.meta.url))).toString("base64");
  await actorContext.run(actor, async () => {
    const body = { expectedVersion: 0, imageData, link: "/pages/products/index" };
    const results = await Promise.allSettled([backend.writeSiteBanner(body, "one"), backend.writeSiteBanner(body, "two")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    backend = new CloudBackend(repo, identity, storage);
    assert.deepEqual(await backend.siteBanner(), { version: 1, imageData, link: "/pages/products/index", startsAt: null, endsAt: null, introduction: null, introLink: null });
    assert.equal((await repo.list<{ action: string }>("audit")).filter((e) => e.action === "UPDATE_SITE_BANNER").length, 1);
  });
});

test("site contact persists with version conflicts under the transaction harness", async () => {
  const repo = new TransactionHarness(); await initialize(repo, "trusted-admin");
  const identity = { subject: async () => "trusted-admin" };
  let backend = new CloudBackend(repo, identity, storage); const actor = await backend.authenticate("test-only");
  await actorContext.run(actor, async () => {
    const input = { expectedVersion: 0, officialQr: null, serviceQr: null, phone: "400-000-0000" };
    const results = await Promise.allSettled([backend.writeSiteContact(input, "first"), backend.writeSiteContact(input, "second")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    backend = new CloudBackend(repo, identity, storage);
    assert.equal((await backend.siteContact()).phone, "400-000-0000");
    assert.equal((await repo.list<{ action: string }>("audit")).filter((event) => event.action === "UPDATE_SITE_CONTACT").length, 1);
  });
});

test("feedback is stored and rate-limited in the transaction harness", async () => {
  const repo = new TransactionHarness(); await initialize(repo, "trusted-admin");
  const identity = { subject: async () => "trusted-admin" };
  let backend = new CloudBackend(repo, identity, storage);
  for (let i = 0; i < 5; i++) await backend.submitFeedback({ content: `feedback ${i}`, contact: "" }, "127.0.0.1");
  await assert.rejects(backend.submitFeedback({ content: "overflow", contact: "" }, "127.0.0.1"), { status: 429 });
  backend = new CloudBackend(repo, identity, storage); const actor = await backend.authenticate("test-only");
  await actorContext.run(actor, async () => assert.equal((await backend.listFeedback()).length, 5));
  await assert.rejects(backend.listFeedback(), { status: 403 });
});

test("five-part codes allocate transactionally by combination and model uniqueness survives edits", async () => {
  const repo = new TransactionHarness(); await initialize(repo, "trusted-admin");
  const backend = new CloudBackend(repo, { subject: async () => "trusted-admin" }, storage);
  const actor = await backend.authenticate("test-only");
  await actorContext.run(actor, async () => {
    const body = (model: string) => ({ name: "虚构测试产品", owner: "测试", model, categoryId: "miding", templateId: "software" as const, templateVersion: 1, productType: "SOFTWARE" as const, ownership: "SELF_DEVELOPED" as const });
    const created = await Promise.all(Array.from({ length: 12 }, (_, i) => backend.create(body(`MODEL-${i}`), randomUUID(), `create-${i}`)));
    assert.deepEqual(new Set(created.map((item) => item.productId)), new Set(Array.from({ length: 12 }, (_, i) => `ZJ-D-S-A-${String(i + 1).padStart(3, "0")}`)));
    await assert.rejects(backend.create(body("  model-0  "), randomUUID(), "duplicate"), { status: 409 });
    const other = await backend.create({ ...body("MODEL-OTHER"), ownership: "PARTNER" }, randomUUID(), "other");
    assert.equal(other.productId, "ZJ-D-S-B-001");
    const initial = created[0];
    await backend.save(initial.productId, { expectedDraftVersion: initial.draftVersion, content: { ...initial.content, model: "NEW-MODEL", categoryId: "miyi", ownership: "PARTNER" } }, "edit");
    assert.equal((await backend.draft(initial.productId)).productId, "ZJ-D-S-A-001");
    await assert.rejects(backend.create(body("new-model"), randomUUID(), "duplicate-after-edit"), { status: 409 });
    await assert.rejects(backend.create(body("MODEL-0"), randomUUID(), "reserved-old-model"), { status: 409 });
  });
});
