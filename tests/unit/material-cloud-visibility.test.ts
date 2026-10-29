import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { CloudBackend } from "../../services/api/src/cloud-backend";
import { initialize } from "../../services/api/src/initialize";
import type {
  Repository,
  Transaction,
} from "../../services/api/src/repository";
import { actorContext } from "../../services/domain/src/identity";
import type { Domain } from "@zj/contracts";

class TransactionHarness implements Repository {
  data = new Map<string, unknown>();
  private tail = Promise.resolve();

  async get<T>(collection: string, id: string) {
    return structuredClone(
      this.data.get(collection + "/" + id),
    ) as T | undefined;
  }

  async set(collection: string, id: string, value: unknown) {
    this.data.set(collection + "/" + id, structuredClone(value));
  }

  async list<T>(collection: string) {
    return [...this.data]
      .filter(([key]) => key.startsWith(collection + "/"))
      .map(([, value]) => structuredClone(value) as T);
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    await previous;
    const snapshot = new Map(structuredClone([...this.data]));
    try {
      return await fn(this);
    } catch (error) {
      this.data = snapshot;
      throw error;
    } finally {
      release();
    }
  }
}

test("CloudBackend revokes promotional materials until a new release", async () => {
  const repo = new TransactionHarness();
  await initialize(repo, "trusted-admin");
  const objects = new Map<string, Buffer>();
  const storage = {
    async upload(path: string, filePath: string) {
      const fileId = "test-object:" + path + ":" + randomUUID();
      const { readFile } = await import("node:fs/promises");
      objects.set(fileId, await readFile(filePath));
      return fileId;
    },
    async download(fileId: string, path: string) {
      const bytes = objects.get(fileId);
      if (!bytes) throw new Error("Test object is missing");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(path, bytes);
    },
  };
  const identity = {
    subject: async (header: string | undefined) => {
      assert.equal(header, "Bearer valid-test-only");
      return "trusted-admin";
    },
  };
  let backend = new CloudBackend(repo, identity, storage);
  const actor = await backend.authenticate("Bearer valid-test-only");

  await actorContext.run(actor, async () => {
    const created = await backend.create(
      {
        name: "【验证数据】宣传资料撤回测试",
        categoryId: "miding",
        templateId: "software",
        templateVersion: 1,
        model: "LOCAL-CLOUD-TEST", productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
        owner: "虚构测试人员",
      },
      randomUUID(),
      "create-product",
    );

    const bytes = await readFile(
      new URL("../fixtures/validation/sample-v1.pdf", import.meta.url),
    );
    const intent = await backend.createUpload(
      {
        productId: created.productId,
        purpose: "preview",
        fileName: "promotional-deck.pdf",
        contentType: "application/pdf",
        size: bytes.length,
      },
      randomUUID(),
    );
    const stream = Readable.from([bytes]) as Readable & {
      headers: IncomingMessage["headers"];
    };
    stream.headers = {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.length),
    };
    await backend.put(intent.uploadId, stream as IncomingMessage);
    const uploaded = await backend.complete(intent.uploadId);
    assert.equal(uploaded.status, "READY");

    const materialId = randomUUID();
    const content: Domain["DraftContent"] = {
      ...created.content,
      tagline: "本地验证用虚构定位",
      summary: "该资料仅用于本地 CloudBackend 可见性测试。",
      problemValues: [{ id: "p", title: "验证问题", text: "虚构说明" }],
      features: [{ id: "f", title: "验证功能", text: "虚构说明" }],
      scenarios: [{ id: "s", title: "验证场景", text: "虚构说明" }],
      technical: { deployment: "仅供测试" },
      materials: [
        {
          materialId,
          versionId: randomUUID(),
          name: "虚构产品介绍演示资料",
          kind: "presentation",
          category: "promotional",
          subCategory: "deck",
          versionLabel: "v1",
          preview: {
            kind: "pdf",
            assetId: uploaded.assetId,
            pageCount: uploaded.pageCount!,
          },
        },
      ],
    };
    let saved = await backend.save(
      created.productId,
      { expectedDraftVersion: created.draftVersion, content },
      "save-promotional-v1",
    );
    const firstRelease = await backend.publish(
      created.productId,
      {
        expectedDraftVersion: saved.draftVersion,
        expectedPublicationVersion: saved.publicationVersion,
        publicContentConfirmed: true,
      },
      randomUUID(),
      "publish-promotional-v1",
    );
    const publicId = (await repo.get<{ publicId: string }>("products", created.productId))!.publicId;
    assert.match(publicId, /^[0-9a-f-]{36}$/);
    assert.notEqual(publicId, created.productId);
    await assert.rejects(backend.publicProduct(created.productId), { status: 404 });
    const firstManifest = await backend.manifest(publicId, materialId);
    assert.equal(firstManifest.releaseId, firstRelease.releaseId);
    assert.deepEqual(
      (await backend.publicProduct(publicId)).materials.map(
        (material) => material.materialId,
      ),
      [materialId],
    );

    const technical = structuredClone(saved.content);
    technical.materials[0] = {
      ...technical.materials[0],
      versionId: randomUUID(),
      versionLabel: "v2",
      category: "technical",
      subCategory: "manual",
    };
    saved = await backend.save(
      created.productId,
      { expectedDraftVersion: saved.draftVersion, content: technical },
      "save-technical-v2",
    );
    backend = new CloudBackend(repo, identity, storage);
    assert.deepEqual(
      (await backend.publicProduct(publicId)).materials,
      [],
    );
    await assert.rejects(backend.manifest(publicId, materialId), {
      status: 404,
    });

    const promotionalAgain = structuredClone(saved.content);
    promotionalAgain.materials[0] = {
      ...promotionalAgain.materials[0],
      versionId: randomUUID(),
      versionLabel: "v3",
      category: "promotional",
      subCategory: "deck",
    };
    saved = await backend.save(
      created.productId,
      { expectedDraftVersion: saved.draftVersion, content: promotionalAgain },
      "save-promotional-v3",
    );
    backend = new CloudBackend(repo, identity, storage);
    assert.deepEqual(
      (await backend.publicProduct(publicId)).materials,
      [],
    );
    await assert.rejects(backend.manifest(publicId, materialId), {
      status: 404,
    });

    const nextRelease = await backend.publish(
      created.productId,
      {
        expectedDraftVersion: saved.draftVersion,
        expectedPublicationVersion: saved.publicationVersion,
        publicContentConfirmed: true,
      },
      randomUUID(),
      "publish-promotional-v3",
    );
    const currentManifest = await backend.manifest(publicId, materialId);
    assert.equal((await repo.get<{ publicId: string }>("products", created.productId))!.publicId, publicId);
    assert.equal(currentManifest.releaseId, nextRelease.releaseId);
    assert.equal(currentManifest.versionId, promotionalAgain.materials[0].versionId);
    assert.notEqual(currentManifest.versionId, firstManifest.versionId);
    assert.deepEqual(
      (await backend.publicProduct(publicId)).materials.map(
        (material) => material.materialId,
      ),
      [materialId],
    );
    await assert.rejects(
      backend.previewAsset(
        publicId,
        materialId,
        firstManifest.releaseId,
        firstManifest.versionId,
        "pdf",
      ),
      { status: 409 },
    );
    assert.equal(
      await backend.previewAsset(
        publicId,
        materialId,
        currentManifest.releaseId,
        currentManifest.versionId,
        "pdf",
      ),
      uploaded.assetId,
    );
  });
});
