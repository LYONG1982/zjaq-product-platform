import { legacyUpload } from "../helpers/legacy-upload";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { makeTestServer } from "../support/server";
import { TestStore } from "../support/store";
import { AppError } from "../../services/domain/src/errors";
import type { DraftContent, Domain } from "@zj/contracts";
const fixture = (f: string) =>
  readFile(new URL("../fixtures/validation/" + f, import.meta.url));
async function setup(store = new TestStore()) {
  const server = makeTestServer({ APP_ENV: "test" }, store);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  const req = async (
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    auth = true,
    extra: Record<string, string> = {},
  ) => {
    const response = await fetch(base + "/api/v1" + path, {
      method,
      headers: {
        ...(auth ? { Authorization: "Bearer local-mock" } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  };
  const create = async (name = "【验证数据】测试软件", key = randomUUID()) =>
    req(
      "/admin/products",
      "POST",
      {
        name,
        categoryId: "miding",
        templateId: "software",
        templateVersion: 1,
        model: name, productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
        owner: "虚构验证人员",
      },
      key,
    );
  const upload = async (
    id: string,
    file = "sample-v1.pdf",
    purpose = "preview",
    contentType = "application/pdf",
  ) => {
    const bytes = await fixture(file),
      imported = purpose === "source" && /\.(docx|pptx)$/.test(file) || purpose === "preview" && contentType.startsWith("image/");
    let intent = await req(
        "/admin/uploads",
        "POST",
        {
          productId: id,
          purpose,
          fileName: file,
          contentType,
          size: bytes.length,
        },
        randomUUID(),
      );
    if (imported) {
      assert.equal(intent.status, 422, "new legacy-format uploads must be rejected");
      intent = { status: 200, body: { data: legacyUpload(store.assets, { productId:id, fileName:file, purpose:purpose as Domain["UploadIntent"]["purpose"], contentType, size:bytes.length }) } } as typeof intent;
    }
    assert.equal(intent.status, 200, JSON.stringify(intent.body));
    const put = await fetch(base + intent.body.data.uploadPath, {
      method: "PUT",
      headers: {
        Authorization: "Bearer local-mock",
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });
    assert.equal(put.status, 200, await put.text());
    const completed = await req("/admin/uploads/complete", "POST", {
      uploadId: intent.body.data.uploadId,
    });
    assert.equal(completed.status, 200);
    assert.equal(
      completed.body.data.status,
      "READY",
      JSON.stringify(completed.body),
    );
    return completed.body.data;
  };
  const ready = async (id: string) => {
    const d = (await req("/admin/products/" + id + "/draft")).body.data,
      a = await upload(id);
    const c: DraftContent = {
      ...d.content,
      tagline: "虚构测试定位",
      summary: "本地验证专用，无真实商业含义。",
      problemValues: [{ id: "p", title: "测试问题", text: "虚构说明" }],
      features: [{ id: "f", title: "测试能力", text: "用于流程验证" }],
      scenarios: [{ id: "s", title: "本地场景", text: "隔离会话" }],
      technical: { deployment: "仅本地验证" },
      boundaries: "没有真实产品能力声明",
      materials: [
        {
          materialId: randomUUID(),
          versionId: randomUUID(),
          name: "测试预览资料",
          kind: "brochure",
          category: "promotional",
          subCategory: "deck",
          versionLabel: "v1",
          preview: { kind: "pdf", assetId: a.assetId, pageCount: a.pageCount },
        },
      ],
    };
    const result = await req("/admin/products/" + id + "/draft", "PATCH", {
      expectedDraftVersion: d.draftVersion,
      content: c,
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.data;
  };
  return {
    base,
    store,
    req,
    create,
    upload,
    ready,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(store.assets.directory, { recursive: true, force: true });
    },
  };
}
test("creation idempotency, template boundaries, draft conflict, preserved template and preview version", async () => {
  const t = await setup();
  try {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      t.create("【验证数据】同一产品", key),
      t.create("【验证数据】同一产品", key),
    ]);
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.data, b.body.data);
    assert.equal(a.body.data.productId, "ZJ-D-S-A-001");
    assert.equal((await t.create("不同内容", key)).status, 409);
    const next = await Promise.all([t.create("并发一"), t.create("并发二")]);
    assert.deepEqual(
      new Set(next.map((r) => r.body.data.productId)),
      new Set(["ZJ-D-S-A-002", "ZJ-D-S-A-003"]),
    );
    const invalid = await t.req(
      "/admin/products",
      "POST",
      {
        name: "x",
        owner: "x",
        categoryId: "miding",
        templateId: "ai",
        templateVersion: 1,
        model: "INVALID-TYPE", productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
      },
      randomUUID(),
    );
    assert.equal(invalid.status, 422);
    const d = a.body.data,
      id = d.productId,
      body = {
        expectedDraftVersion: d.draftVersion,
        content: { ...d.content, summary: "未完成的草稿" },
      };
    const saves = await Promise.all([
      t.req("/admin/products/" + id + "/draft", "PATCH", body),
      t.req("/admin/products/" + id + "/draft", "PATCH", body),
    ]);
    assert.deepEqual(saves.map((s) => s.status).sort(), [200, 409]);
    assert.equal(
      (await t.req("/admin/products/" + id + "/preview?expectedDraftVersion=1"))
        .status,
      409,
    );
    assert.equal(
      (await t.req("/admin/products/" + id + "/preview?expectedDraftVersion=2"))
        .status,
      200,
    );
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/preview?expectedDraftVersion=2",
          "GET",
          undefined,
          undefined,
          false,
        )
      ).status,
      401,
    );
    const changed = { ...d.content, templateId: "device" };
    assert.equal(
      (
        await t.req("/admin/products/" + id + "/draft", "PATCH", {
          expectedDraftVersion: 2,
          content: changed,
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          {
            expectedDraftVersion: 2,
            expectedPublicationVersion: 0,
            publicContentConfirmed: true,
          },
          randomUUID(),
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/unpublish",
          "POST",
          { expectedPublicationVersion: 0 },
          randomUUID(),
        )
      ).status,
      409,
    );
    assert.deepEqual(
      (await t.req("/catalog/products", "GET", undefined, undefined, false))
        .body.data,
      [],
    );
  } finally {
    await t.close();
  }
});
test("publish snapshots, update version binding, range, unpublish and republish with immutable assets", async () => {
  const t = await setup();
  try {
    const id = (await t.create()).body.data.productId,
      d = await t.ready(id),
      publishBody = {
        expectedDraftVersion: d.draftVersion,
        expectedPublicationVersion: 0,
        publicContentConfirmed: true,
      },
      key = randomUUID();
    const a = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      publishBody,
      key,
    );
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.deepEqual(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          publishBody,
          key,
        )
      ).body.data,
      a.body.data,
    );
    assert.equal(t.store.releases.size, 1);
    const publicDraft = await t.req(
      "/catalog/products/" + t.store.product(id).publicId,
      "GET",
      undefined,
      undefined,
      false,
    );
    assert.equal(publicDraft.status, 200);
    for (const privateKey of [
      "owner",
      "internal",
      "sourceAssetId",
      "draftVersion",
    ])
      assert.ok(
        !JSON.stringify(publicDraft.body).includes('"' + privateKey + '"'),
      );
    assert.equal(
      (await t.req("/catalog/categories", "GET", undefined, undefined, false))
        .body.data[0].productCount,
      1,
    );
    const mat = d.content.materials[0],
      manifest = (
        await t.req(
          `/catalog/products/${t.store.product(id).publicId}/materials/${mat.materialId}/preview`,
          "GET",
          undefined,
          undefined,
          false,
        )
      ).body.data,
      path = manifest.parts[0].path;
    const range = await fetch(t.base + path, {
      headers: { Range: "bytes=0-4" },
    });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "%PDF-");
    assert.equal(range.headers.get("cache-control"), "no-store");
    assert.equal(
      range.headers.get("content-range")?.startsWith("bytes 0-4/"),
      true,
    );
    for (const bad of [
      "bytes=999999999-",
      "bytes=3-2",
      "bytes=0-2,4-8",
      "bytes=-0",
    ])
      assert.equal(
        (await fetch(t.base + path, { headers: { Range: bad } })).status,
        416,
      );
    const a1 = [...t.store.assets.uploads.values()][0];
    assert.equal(
      (
        await fetch(t.base + `/api/v1/admin/uploads/${a1.uploadId}/content`, {
          method: "PUT",
          headers: {
            Authorization: "Bearer local-mock",
            "Content-Type": "application/octet-stream",
          },
          body: await fixture("sample-v1.pdf"),
        })
      ).status,
      409,
    );
    const v2 = await t.upload(id, "sample-v2.pdf");
    const c = structuredClone(d.content);
    c.name = "【验证数据】已编辑未发布";
    c.materials[0] = {
      ...mat,
      versionId: randomUUID(),
      versionLabel: "v2",
      preview: { kind: "pdf", assetId: v2.assetId, pageCount: v2.pageCount },
    };
    const saved = await t.req("/admin/products/" + id + "/draft", "PATCH", {
      expectedDraftVersion: d.draftVersion,
      content: c,
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.hasUnpublishedChanges, true);
    const history = await t.req("/admin/products/" + id + "/material-versions");
    assert.equal(history.status, 200);
    assert.deepEqual(new Set(history.body.data.map((item: { versionLabel: string }) => item.versionLabel)), new Set(["v1", "v2"]));
    assert.equal((await t.req("/admin/products/" + id + "/material-versions", "GET", undefined, undefined, false)).status, 401);
    assert.equal(
      (
        await t.req(
          "/catalog/products/" + t.store.product(id).publicId,
          "GET",
          undefined,
          undefined,
          false,
        )
      ).body.data.name,
      d.content.name,
    );
    assert.equal((await fetch(t.base + path)).status, 200);
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          publishBody,
          randomUUID(),
        )
      ).status,
      409,
    );
    const updated = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      {
        ...publishBody,
        expectedDraftVersion: saved.body.data.draftVersion,
        expectedPublicationVersion: 1,
      },
      randomUUID(),
    );
    assert.equal(updated.status, 200);
    assert.equal((await fetch(t.base + path)).status, 409);
    assert.equal(
      (
        await t.req(
          "/catalog/products/" + t.store.product(id).publicId,
          "GET",
          undefined,
          undefined,
          false,
        )
      ).body.data.name,
      c.name,
    );
    const current = (
      await t.req(
        `/catalog/products/${t.store.product(id).publicId}/materials/${mat.materialId}/preview`,
        "GET",
        undefined,
        undefined,
        false,
      )
    ).body.data.parts[0].path;
    const incomplete = { ...c, summary: "" };
    await t.req("/admin/products/" + id + "/draft", "PATCH", {
      expectedDraftVersion: saved.body.data.draftVersion,
      content: incomplete,
    });
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          {
            expectedDraftVersion: saved.body.data.draftVersion + 1,
            expectedPublicationVersion: 2,
            publicContentConfirmed: true,
          },
          randomUUID(),
        )
      ).status,
      422,
    );
    assert.equal((await fetch(t.base + current)).status, 200);
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/unpublish",
          "POST",
          { expectedPublicationVersion: 2 },
          randomUUID(),
        )
      ).status,
      200,
    );
    assert.equal(
      (await fetch(t.base + current, { headers: { Range: "bytes=0-4" } }))
        .status,
      404,
    );
    assert.equal(
      (
        await t.req(
          "/catalog/products/" + t.store.product(id).publicId,
          "GET",
          undefined,
          undefined,
          false,
        )
      ).status,
      404,
    );
    assert.deepEqual(
      (await t.req("/catalog/materials", "GET", undefined, undefined, false))
        .body.data,
      [],
    );
    const finalDraft = (await t.req("/admin/products/" + id + "/draft")).body
      .data;
    assert.equal(finalDraft.content.summary, "");
    const restored = await t.req("/admin/products/" + id + "/draft", "PATCH", {
      expectedDraftVersion: finalDraft.draftVersion,
      content: c,
    });
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          {
            expectedDraftVersion: restored.body.data.draftVersion,
            expectedPublicationVersion: 3,
            publicContentConfirmed: true,
          },
          randomUUID(),
        )
      ).status,
      200,
    );
    assert.equal(t.store.releases.size, 3);
  } finally {
    await t.close();
  }
});
test("atomic failure and publication race do not mutate the previous snapshot or append duplicate logs", async () => {
  let fail = false;
  const store = new TestStore((action) => {
    if (fail && action === "PUBLISH") throw new Error("injected");
  });
  const t = await setup(store);
  try {
    const id = (await t.create()).body.data.productId,
      d = await t.ready(id),
      body = {
        expectedDraftVersion: d.draftVersion,
        expectedPublicationVersion: 0,
        publicContentConfirmed: true,
      };
    fail = true;
    const result = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      body,
      randomUUID(),
    );
    assert.equal(result.status, 500);
    assert.equal(store.releases.size, 0);
    assert.equal(store.events.filter((e) => e.action === "PUBLISH").length, 0);
    assert.equal(store.product(id).publicationVersion, 0);
    fail = false;
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          body,
          randomUUID(),
        )
      ).status,
      200,
    );
    const oldRelease = store.product(id).activeReleaseId,
      oldEventCount = store.events.length;
    fail = true;
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/publish",
          "POST",
          { ...body, expectedPublicationVersion: 1 },
          randomUUID(),
        )
      ).status,
      500,
    );
    assert.equal(store.product(id).activeReleaseId, oldRelease);
    assert.equal(store.releases.size, 1);
    assert.equal(store.events.length, oldEventCount);
    assert.equal((await t.req("/catalog/products/" + t.store.product(id).publicId)).status, 200);
    fail = false;
    const race = await Promise.all([
      t.req(
        "/admin/products/" + id + "/publish",
        "POST",
        { ...body, expectedPublicationVersion: 1 },
        randomUUID(),
      ),
      t.req(
        "/admin/products/" + id + "/unpublish",
        "POST",
        { expectedPublicationVersion: 1 },
        randomUUID(),
      ),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    assert.equal(store.product(id).publicationVersion, 2);
  } finally {
    await t.close();
  }
});
test("file signature, length, type, ownership, metadata cleaning, material identity and source isolation", async () => {
  const t = await setup();
  try {
    const id = (await t.create()).body.data.productId,
      other = (await t.create("另一个虚构产品")).body.data.productId;
    assert.equal(
      (
        await t.req(
          "/admin/uploads",
          "POST",
          {
            productId: id,
            purpose: "preview",
            fileName: "bad.pdf",
            contentType: "application/pdf",
            size: 501 * 1024 * 1024,
          },
          randomUUID(),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await t.req(
          "/admin/uploads",
          "POST",
          {
            productId: id,
            purpose: "preview",
            fileName: "../bad.pdf",
            contentType: "application/pdf",
            size: 10,
          },
          randomUUID(),
        )
      ).status,
      400,
    );
    const bad = Buffer.from("<html>not PDF</html>"),
      intent = (
        await t.req(
          "/admin/uploads",
          "POST",
          {
            productId: id,
            purpose: "preview",
            fileName: "bad.pdf",
            contentType: "application/pdf",
            size: bad.length,
          },
          randomUUID(),
        )
      ).body.data;
    const put = await fetch(t.base + intent.uploadPath, {
      method: "PUT",
      headers: {
        Authorization: "Bearer local-mock",
        "Content-Type": "application/octet-stream",
      },
      body: bad,
    });
    assert.equal(put.status, 200);
    const completed = await t.req("/admin/uploads/complete", "POST", {
      uploadId: intent.uploadId,
    });
    assert.equal(completed.body.data.status, "REJECTED");
    assert.equal(
      (
        await t.req("/admin/uploads/complete", "POST", {
          uploadId: intent.uploadId,
        })
      ).body.data.status,
      "REJECTED",
    );
    const image = await t.upload(id, "page-1.png", "preview", "image/png");
    assert.equal(image.pageCount, 1);
    assert.match(image.checksum, /^[0-9a-f]{64}$/);
    const draft = (await t.req("/admin/products/" + other + "/draft")).body
      .data;
    const mat: Domain["MaterialRef"] = {
      materialId: randomUUID(),
      versionId: randomUUID(),
      kind: "other",
      name: "图片",
      versionLabel: "v1",
      preview: {
        kind: "images",
        pages: [{ assetId: image.assetId, pageIndex: 1, alt: "测试页" }],
      },
    };
    assert.equal(
      (
        await t.req("/admin/products/" + other + "/draft", "PATCH", {
          expectedDraftVersion: 1,
          content: { ...draft.content, materials: [mat] },
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await fetch(
          t.base +
            `/api/v1/admin/products/${id}/assets/${image.assetId}/content`,
        )
      ).status,
      401,
    );
    const own = (await t.req("/admin/products/" + id + "/draft")).body.data;
    const saved = await t.req("/admin/products/" + id + "/draft", "PATCH", {
      expectedDraftVersion: 1,
      content: { ...own.content, materials: [mat] },
    });
    assert.equal(saved.status, 200);
    const reused = { ...mat, name: "改名却复用版本" };
    assert.equal(
      (
        await t.req("/admin/products/" + id + "/draft", "PATCH", {
          expectedDraftVersion: 2,
          content: { ...own.content, materials: [reused] },
        })
      ).status,
      422,
    );
    const duplicateLabel = { ...mat, versionId: randomUUID() };
    assert.equal(
      (
        await t.req("/admin/products/" + id + "/draft", "PATCH", {
          expectedDraftVersion: 2,
          content: { ...own.content, materials: [duplicateLabel] },
        })
      ).status,
      422,
    );
    const misordered = {
      ...mat,
      versionId: randomUUID(),
      versionLabel: "v2",
      preview: {
        kind: "images",
        pages: [{ assetId: image.assetId, pageIndex: 2, alt: "顺序错误" }],
      },
    };
    assert.equal(
      (
        await t.req("/admin/products/" + id + "/draft", "PATCH", {
          expectedDraftVersion: 2,
          content: { ...own.content, materials: [misordered] },
        })
      ).status,
      422,
    );
  } finally {
    await t.close();
  }
});
test("historical Office sources and image previews retain parsing and private byte isolation", async () => {
  const t = await setup();
  try {
    const id = (await t.create()).body.data.productId,
      d = await t.ready(id),
      source = await t.upload(
        id,
        "sample-source.docx",
        "source",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    const bad = await fixture("malformed-source.docx");
    const historical = { productId: id, purpose: "source" as const, fileName: "bad.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: bad.length };
    assert.equal((await t.req("/admin/uploads", "POST", historical, randomUUID())).status, 422);
    const intent = legacyUpload(t.store.assets, historical);
    await fetch(t.base + intent.uploadPath, {
      method: "PUT",
      headers: {
        Authorization: "Bearer local-mock",
        "Content-Type": "application/octet-stream",
      },
      body: bad,
    });
    assert.equal(
      (
        await t.req("/admin/uploads/complete", "POST", {
          uploadId: intent.uploadId,
        })
      ).body.data.status,
      "REJECTED",
    );
    const c = structuredClone(d.content);
    c.materials[0].sourceAssetId = source.assetId;
    c.materials[0].versionId = randomUUID();
    c.materials[0].versionLabel = "v2";
    const images = [];
    for (let n = 1; n <= 3; n++) {
      const a = await t.upload(id, `page-${n}.png`, "preview", "image/png");
      images.push({
        assetId: a.assetId,
        pageIndex: n,
        alt: "验证第 " + n + " 页",
      });
    }
    c.materials[0].preview = { kind: "images", pages: images };
    const media = await t.upload(id, "page-1.png", "media", "image/png");
    c.media = [
      {
        mediaId: "cover",
        assetId: media.assetId,
        role: "cover",
        alt: "虚构验证封面",
      },
    ];
    const saved = await t.req("/admin/products/" + id + "/draft", "PATCH", {
      expectedDraftVersion: d.draftVersion,
      content: c,
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const pub = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      {
        expectedDraftVersion: saved.body.data.draftVersion,
        expectedPublicationVersion: 0,
        publicContentConfirmed: true,
      },
      randomUUID(),
    );
    assert.equal(pub.status, 200);
    const publicData = (
      await t.req("/catalog/products/" + t.store.product(id).publicId, "GET", undefined, undefined, false)
    ).body;
    assert.ok(!JSON.stringify(publicData).includes(source.assetId));
    const m = (
      await t.req(
        `/catalog/products/${t.store.product(id).publicId}/materials/${c.materials[0].materialId}/preview`,
        "GET",
        undefined,
        undefined,
        false,
      )
    ).body.data;
    assert.equal(m.parts.length, 3);
    assert.deepEqual(
      m.parts.map((p: { part: string }) => p.part),
      ["page-1", "page-2", "page-3"],
    );
    assert.equal(
      (
        await fetch(
          t.base + m.parts[0].path.replace("part=page-1", "part=source"),
        )
      ).status,
      404,
    );
    const sourceResponse = await fetch(
      t.base + `/api/v1/admin/products/${id}/assets/${source.assetId}/content`,
      { headers: { Authorization: "Bearer local-mock" } },
    );
    assert.equal(sourceResponse.status, 200);
    assert.match(
      sourceResponse.headers.get("content-type") ?? "",
      /wordprocessingml/,
    );
    const cover = publicData.data.media[0].path;
    assert.equal((await fetch(t.base + cover)).status, 200);
    await t.req(
      "/admin/products/" + id + "/unpublish",
      "POST",
      { expectedPublicationVersion: 1 },
      randomUUID(),
    );
    assert.equal((await fetch(t.base + cover)).status, 404);
    assert.equal((await fetch(t.base + m.parts[2].path)).status, 404);
  } finally {
    await t.close();
  }
});

test("public pagination and literal search use releases, while invalid empty and mismatched uploads fail", async () => {
  const t = await setup();
  try {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = (await t.create("【验证数据】分页 " + i)).body.data.productId;
      ids.push(id);
      const d = await t.ready(id);
      assert.equal(
        (
          await t.req(
            "/admin/products/" + id + "/publish",
            "POST",
            {
              expectedDraftVersion: d.draftVersion,
              expectedPublicationVersion: 0,
              publicContentConfirmed: true,
            },
            randomUUID(),
          )
        ).status,
        200,
      );
    }
    const first = (await t.req("/catalog/products?limit=2&categoryId=miding"))
      .body;
    assert.equal(first.data.length, 2);
    assert.equal(first.page.hasMore, true);
    const second = (
      await t.req(
        "/catalog/products?limit=2&categoryId=miding&cursor=" +
          first.page.nextCursor,
      )
    ).body;
    assert.equal(second.data.length, 1);
    assert.equal(second.page.hasMore, false);
    assert.deepEqual(
      new Set([...first.data, ...second.data].map((x) => x.productId)),
      new Set(ids.map((id) => t.store.product(id).publicId)),
    );
    assert.equal(
      (
        await t.req(
          "/catalog/products?limit=2&categoryId=miyi&cursor=" +
            first.page.nextCursor,
        )
      ).status,
      400,
    );
    const d = (await t.req("/admin/products/" + ids[0] + "/draft")).body.data;
    await t.req("/admin/products/" + ids[0] + "/draft", "PATCH", {
      expectedDraftVersion: d.draftVersion,
      content: {
        ...d.content,
        name: "UNPUBLISHED_ONLY",
        aliases: ["SECRET_DRAFT_ALIAS"],
      },
    });
    for (const q of ["UNPUBLISHED_ONLY", "SECRET_DRAFT_ALIAS", ".*", "["])
      assert.deepEqual(
        (await t.req("/catalog/products?q=" + encodeURIComponent(q))).body.data,
        [],
      );
    assert.equal(
      (await t.req("/catalog/products?q=" + encodeURIComponent("分页 0"))).body
        .data.length,
      1,
    );
    assert.equal(
      (
        await t.req(
          "/admin/uploads",
          "POST",
          {
            productId: ids[0],
            purpose: "preview",
            fileName: "empty.pdf",
            contentType: "application/pdf",
            size: 0,
          },
          randomUUID(),
        )
      ).status,
      400,
    );
    const intent = (
      await t.req(
        "/admin/uploads",
        "POST",
        {
          productId: ids[0],
          purpose: "preview",
          fileName: "short.pdf",
          contentType: "application/pdf",
          size: 3,
        },
        randomUUID(),
      )
    ).body.data;
    assert.equal(
      (
        await fetch(t.base + intent.uploadPath, {
          method: "PUT",
          headers: {
            Authorization: "Bearer local-mock",
            "Content-Type": "application/octet-stream",
          },
          body: Buffer.from("ab"),
        })
      ).status,
      422,
    );
  } finally {
    await t.close();
  }
});
test("manual sequence creates the requested code, rejects occupied codes and skips occupied auto numbers", async () => {
  const t = await setup();
  try {
    const manual = {
      name: "【验证数据】手填编号产品",
      categoryId: "miding",
      templateId: "software",
      templateVersion: 1,
      model: "MANUAL-001",
      productType: "SOFTWARE",
      ownership: "SELF_DEVELOPED",
      owner: "虚构验证人员",
      sequence: 8,
    };
    const created = await t.req("/admin/products", "POST", manual, randomUUID());
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.data.productId, "ZJ-D-S-A-008");
    const occupied = await t.req(
      "/admin/products",
      "POST",
      { ...manual, name: "【验证数据】占用编号产品", model: "MANUAL-002" },
      randomUUID(),
    );
    assert.equal(occupied.status, 409);
    assert.match(occupied.body.error.message, /ZJ-D-S-A-008/);
    assert.match(occupied.body.error.message, /手填编号产品/);
    const outOfRange = await t.req(
      "/admin/products",
      "POST",
      { ...manual, name: "【验证数据】越界编号产品", model: "MANUAL-003", sequence: 1000 },
      randomUUID(),
    );
    assert.equal(outOfRange.status, 400);
    const auto = await t.create("【验证数据】自动编号产品");
    assert.equal(auto.body.data.productId, "ZJ-D-S-A-009");
  } finally {
    await t.close();
  }
});
test("only unpublished drafts can be renumbered, with conflict detection and audit trail", async () => {
  const t = await setup();
  try {
    const first = (await t.create("【验证数据】待改号草稿")).body.data;
    const id = first.productId;
    assert.equal(id, "ZJ-D-S-A-001");
    assert.equal((await t.create("【验证数据】已占用草稿")).body.data.productId, "ZJ-D-S-A-002");
    const conflict = await t.req(
      "/admin/products/" + id + "/renumber",
      "POST",
      {
        expectedDraftVersion: first.draftVersion,
        categoryId: "miding",
        productType: "SOFTWARE",
        ownership: "SELF_DEVELOPED",
        sequence: 2,
        reason: "编号占用验证",
      },
      randomUUID(),
    );
    assert.equal(conflict.status, 409);
    assert.match(conflict.body.error.message, /ZJ-D-S-A-002/);
    assert.match(conflict.body.error.message, /已占用草稿/);
    const renamed = await t.req(
      "/admin/products/" + id + "/renumber",
      "POST",
      {
        expectedDraftVersion: first.draftVersion,
        categoryId: "miyi",
        productType: "HARDWARE",
        ownership: "PARTNER",
        sequence: 5,
        reason: "按对照表纠正编号",
      },
      randomUUID(),
    );
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.data.productId, "ZJ-Y-H-B-005");
    assert.equal(renamed.body.data.content.categoryId, "miyi");
    assert.equal(renamed.body.data.content.productType, "HARDWARE");
    assert.equal(renamed.body.data.content.ownership, "PARTNER");
    assert.equal(renamed.body.data.draftVersion, first.draftVersion + 1);
    assert.equal((await t.req("/admin/products/" + id + "/draft")).status, 404);
    const audit = await t.req(
      "/admin/audit-events?productId=ZJ-Y-H-B-005&action=RENUMBER_PRODUCT",
    );
    assert.equal(audit.body.data.length, 1);
    assert.match(audit.body.data[0].reason, /ZJ-D-S-A-001 → ZJ-Y-H-B-005/);
    const published = await t.create("【验证数据】已发布产品");
    const publishedId = published.body.data.productId;
    const ready = await t.ready(publishedId);
    const publish = await t.req(
      "/admin/products/" + publishedId + "/publish",
      "POST",
      {
        expectedDraftVersion: ready.draftVersion,
        expectedPublicationVersion: 0,
        publicContentConfirmed: true,
      },
      randomUUID(),
    );
    assert.equal(publish.status, 200, JSON.stringify(publish.body));
    const rejected = await t.req(
      "/admin/products/" + publishedId + "/renumber",
      "POST",
      {
        expectedDraftVersion: ready.draftVersion,
        categoryId: "miding",
        productType: "SOFTWARE",
        ownership: "SELF_DEVELOPED",
        sequence: 9,
        reason: "已发布不可直接改号",
      },
      randomUUID(),
    );
    assert.equal(rejected.status, 409);
    assert.match(rejected.body.error.message, /仅草稿状态的产品可以修改编号/);
  } finally {
    await t.close();
  }
});
test("offline products can be restored to draft and republished with history preserved", async () => {
  const t = await setup();
  try {
    const id = (await t.create("【验证数据】恢复草稿产品")).body.data.productId;
    const ready = await t.ready(id);
    const published = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      { expectedDraftVersion: ready.draftVersion, expectedPublicationVersion: 0, publicContentConfirmed: true },
      randomUUID(),
    );
    assert.equal(published.status, 200, JSON.stringify(published.body));
    const restoreBody = (publicationVersion: number) => ({
      expectedDraftVersion: ready.draftVersion,
      expectedPublicationVersion: publicationVersion,
      reason: "恢复为草稿继续整理",
      confirmed: true as const,
    });
    const beforeOffline = await t.req(
      "/admin/products/" + id + "/restore-draft",
      "POST",
      restoreBody(published.body.data.publicationVersion),
      randomUUID(),
    );
    assert.equal(beforeOffline.status, 409);
    const offline = await t.req(
      "/admin/products/" + id + "/unpublish",
      "POST",
      { expectedPublicationVersion: published.body.data.publicationVersion, reason: "下架验证" },
      randomUUID(),
    );
    assert.equal(offline.status, 200, JSON.stringify(offline.body));
    assert.equal(offline.body.data.publicationState, "OFFLINE");
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/restore-draft",
          "POST",
          { ...restoreBody(0) },
          randomUUID(),
        )
      ).status,
      409,
    );
    const restored = await t.req(
      "/admin/products/" + id + "/restore-draft",
      "POST",
      restoreBody(offline.body.data.publicationVersion),
      randomUUID(),
    );
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    assert.equal(restored.body.data.productId, id);
    assert.equal(restored.body.data.publicationState, "DRAFT");
    assert.equal(restored.body.data.publicationVersion, offline.body.data.publicationVersion + 1);
    assert.equal(restored.body.data.lastPublishedDraftVersion, ready.draftVersion);
    assert.equal(restored.body.data.content.name, ready.content.name);
    const audit = await t.req("/admin/audit-events?productId=" + id + "&action=RESTORE_DRAFT");
    assert.equal(audit.body.data.length, 1);
    assert.equal(audit.body.data[0].reason, "恢复为草稿继续整理");
    assert.deepEqual((await t.req("/catalog/products")).body.data, []);
    assert.equal(
      (
        await t.req(
          "/admin/products/" + id + "/restore-draft",
          "POST",
          restoreBody(restored.body.data.publicationVersion),
          randomUUID(),
        )
      ).status,
      409,
    );
    const republished = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      {
        expectedDraftVersion: restored.body.data.draftVersion,
        expectedPublicationVersion: restored.body.data.publicationVersion,
        publicContentConfirmed: true,
      },
      randomUUID(),
    );
    assert.equal(republished.status, 200, JSON.stringify(republished.body));
    assert.equal(republished.body.data.releaseSequence, 2);
  } finally {
    await t.close();
  }
});
test("restored drafts with publication history can be renumbered and republished", async () => {
  const t = await setup();
  try {
    const id = (await t.create("【验证数据】历史改号产品")).body.data.productId;
    const ready = await t.ready(id);
    const published = await t.req(
      "/admin/products/" + id + "/publish",
      "POST",
      { expectedDraftVersion: ready.draftVersion, expectedPublicationVersion: 0, publicContentConfirmed: true },
      randomUUID(),
    );
    assert.equal(published.status, 200, JSON.stringify(published.body));
    const offline = await t.req(
      "/admin/products/" + id + "/unpublish",
      "POST",
      { expectedPublicationVersion: published.body.data.publicationVersion, reason: "下架改号" },
      randomUUID(),
    );
    const restored = await t.req(
      "/admin/products/" + id + "/restore-draft",
      "POST",
      {
        expectedDraftVersion: ready.draftVersion,
        expectedPublicationVersion: offline.body.data.publicationVersion,
        reason: "恢复为草稿后改号",
        confirmed: true,
      },
      randomUUID(),
    );
    assert.equal(restored.status, 200, JSON.stringify(restored.body));
    const renamed = await t.req(
      "/admin/products/" + id + "/renumber",
      "POST",
      {
        expectedDraftVersion: restored.body.data.draftVersion,
        categoryId: "miding",
        productType: "HARDWARE",
        ownership: "SELF_DEVELOPED",
        sequence: 6,
        reason: "历史产品改号",
      },
      randomUUID(),
    );
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    const newId = "ZJ-D-H-A-006";
    assert.equal(renamed.body.data.productId, newId);
    assert.equal(renamed.body.data.releaseSequence, published.body.data.releaseSequence);
    assert.equal((await t.req("/admin/products/" + id + "/draft")).status, 404);
    const audit = await t.req("/admin/audit-events?productId=" + newId + "&action=RENUMBER_PRODUCT");
    assert.equal(audit.body.data.length, 1);
    assert.match(audit.body.data[0].reason, new RegExp(id + " → " + newId));
    const republished = await t.req(
      "/admin/products/" + newId + "/publish",
      "POST",
      {
        expectedDraftVersion: renamed.body.data.draftVersion,
        expectedPublicationVersion: renamed.body.data.publicationVersion,
        publicContentConfirmed: true,
      },
      randomUUID(),
    );
    assert.equal(republished.status, 200, JSON.stringify(republished.body));
    assert.equal(republished.body.data.releaseSequence, 2);
  } finally {
    await t.close();
  }
});
