import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "../packages/api-client/src/index";
import type { AdminDraft, Domain, DraftContent } from "@zj/contracts";
const base = new URL(
  process.env.DEMO_API_BASE ?? "http://127.0.0.1:3100/api/v1",
);
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.pathname !== "/api/v1" ||
  base.username ||
  base.password ||
  base.search ||
  base.hash
)
  throw new Error(
    "Validation seed only accepts an explicit loopback Mock API.",
  );
const health = await fetch(new URL("/health", base), {
  signal: AbortSignal.timeout(5000),
}).then((r) => r.json());
if (
  health.provider !== "mock" ||
  health.scope !== "TASK-02/03" ||
  typeof health.sessionId !== "string" ||
  !/^[a-f0-9-]{36}$/.test(health.sessionId)
)
  throw new Error("Target is not the expected session-only Mock service.");
const api = createClient(base.toString(), undefined, "local-mock");
const root = new URL("../work/validation-data/", import.meta.url);
await mkdir(root, { recursive: true });
const journalPath = new URL(health.sessionId + ".json", root);
type RecordState = {
  id: string;
  phase: string;
  fingerprint: string;
  complete?: boolean;
};
type Journal = {
  sessionId: string;
  records: Record<string, RecordState>;
  results: unknown[];
};
let journal: Journal = {
  sessionId: health.sessionId,
  records: {},
  results: [],
};
try {
  journal = JSON.parse(await readFile(journalPath, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const persist = () =>
  writeFile(journalPath, JSON.stringify(journal, null, 2) + "\n");
function fingerprint(d: AdminDraft) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        d.content,
        d.draftVersion,
        d.publicationVersion,
        d.publicationState,
      ]),
    )
    .digest("hex");
}
const key = (s: string) =>
  createHash("sha256")
    .update(health.sessionId + " round02 " + s)
    .digest("hex");
async function checkpoint(kind: string, phase: string) {
  const r = journal.records[kind];
  const d = (await api.draft(r.id)).data;
  r.phase = phase;
  r.fingerprint = fingerprint(d);
  await persist();
  return d;
}
const fixtures = new URL("../tests/fixtures/validation/", import.meta.url);
async function upload(
  id: string,
  fileName: string,
  purpose: "source" | "preview",
  contentType: string,
) {
  const bytes = await readFile(new URL(fileName, fixtures));
  const intent = (
    await api.createUpload(
      { productId: id, purpose, fileName, contentType, size: bytes.length },
      key(id + "/" + fileName + "/" + purpose),
    )
  ).data;
  let status = (await api.uploadStatus(intent.uploadId)).data;
  if (status.status === "UPLOADING") {
    await api.putBytes(intent.uploadId, new Blob([new Uint8Array(bytes)]));
    status = (await api.uploadStatus(intent.uploadId)).data;
  }
  if (status.status === "CHECKING")
    status = (await api.completeUpload(intent.uploadId)).data;
  if (status.status !== "READY")
    throw new Error(status.error ?? "Fixture failed validation");
  return status;
}
const definitions = [
  {
    kind: "software",
    category: "miding",
    name: "【验证数据】软件制作示例",
    final: "PUBLISHED",
  },
  {
    kind: "device",
    category: "miyi",
    name: "【验证数据】设备资料示例",
    final: "PUBLISHED",
  },
  {
    kind: "delivery",
    category: "mishu",
    name: "【验证数据】交付方案示例",
    final: "DRAFT",
  },
  {
    kind: "ai",
    category: "ai",
    name: "【验证数据】AI边界示例",
    final: "OFFLINE",
  },
] as const;
const templates = (await api.templates()).data;
journal.results = [];
for (const item of definitions) {
  try {
    let record = journal.records[item.kind];
    if (record) {
      const actual = (await api.draft(record.id)).data;
      if (fingerprint(actual) !== record.fingerprint)
        throw new Error("内容或版本已被修改，保留用户修改并跳过");
      if (record.complete) {
        journal.results.push({
          productId: record.id,
          name: item.name,
          result: "UNCHANGED",
          state: actual.publicationState,
        });
        continue;
      }
      throw new Error(
        "上次执行未完整完成，已保留中间状态，请核对后继续；不自动覆盖",
      );
    }
    const existing = (await api.products({ q: item.name, limit: 100 })).data;
    if (existing.some((p) => p.name === item.name))
      throw new Error(
        "发现同名验证产品但没有本次运行记录，跳过以避免重复或覆盖",
      );
    const template = templates.find(
      (t) => t.id === item.kind && t.enabledForCreate,
    );
    if (!template) throw new Error("Required template unavailable");
    const created = (
      await api.create(
        {
          name: item.name,
          categoryId: item.category,
          templateId: item.kind,
          templateVersion: template.version,
          owner: "本地虚构验证人员",
          aliases: ["validation-round02-" + item.kind],
        },
        key("create/" + item.kind),
      )
    ).data;
    record = {
      id: created.productId,
      phase: "created",
      fingerprint: fingerprint(created),
    };
    journal.records[item.kind] = record;
    await persist();
    const preview: Domain["PreviewRef"] =
      item.kind === "device"
        ? { kind: "images", pages: [] }
        : { kind: "pdf", assetId: "pending", pageCount: 1 };
    if (preview.kind === "images") {
      for (let pageIndex = 1; pageIndex <= 3; pageIndex++) {
        const a = await upload(
          record.id,
          `page-${pageIndex}.png`,
          "preview",
          "image/png",
        );
        preview.pages.push({
          assetId: a.assetId,
          pageIndex,
          alt: "虚构验证资料第 " + pageIndex + " 页",
        });
      }
    } else {
      const a = await upload(
        record.id,
        "sample-v1.pdf",
        "preview",
        "application/pdf",
      );
      preview.assetId = a.assetId;
      preview.pageCount = a.pageCount!;
    }
    const content: DraftContent = {
      ...created.content,
      tagline: "虚构内容，仅用于本地流程验证",
      summary:
        "本产品是独立验证数据，用于检查内容制作、资料版本与发布状态。所有描述均为虚构，不代表中技安全任何真实产品能力。",
      audiences: "本地开发与验收人员",
      problemValues: [
        {
          id: "problem-1",
          title: "验证内容流转",
          text: "检查从草稿到当前发布快照的行为。",
        },
      ],
      features: [
        {
          id: "feature-1",
          title: "验证状态隔离",
          text: "仅说明测试目标，不作真实功能或性能承诺。",
        },
      ],
      scenarios: [
        {
          id: "scenario-1",
          title: "本地模拟演示",
          text: "运行在回环地址与隔离 Mock 会话。",
        },
      ],
      technical: Object.fromEntries(
        template.fields
          .filter((f) => f.requiredOnPublish)
          .map((f) => [
            f.key,
            "虚构验证说明：" +
              f.label +
              "仅作为表单与校验测试，不代表真实参数。",
          ]),
      ),
      boundaries: "仅用于本地验证，不用于生产发布、销售资料或真实客户案例。",
      materials: [
        {
          materialId: randomUUID(),
          versionId: randomUUID(),
          name:
            "【验证资料】" + (item.kind === "device" ? "有序图片" : "两页 PDF"),
          kind: "brochure",
          versionLabel: "v1",
          preview,
        },
      ],
    };
    if (item.kind === "software") {
      const source = await upload(
        record.id,
        "sample-source.docx",
        "source",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      content.materials[0].sourceAssetId = source.assetId;
    }
    if (item.kind === "delivery") {
      const field = template.fields.find((f) => f.requiredOnPublish);
      if (field) content.technical[field.key] = "";
    }
    let d = (
      await api.save(record.id, {
        expectedDraftVersion: created.draftVersion,
        content,
      })
    ).data;
    await checkpoint(item.kind, "saved");
    if (item.final !== "DRAFT") {
      await api.publish(
        record.id,
        {
          expectedDraftVersion: d.draftVersion,
          expectedPublicationVersion: d.publicationVersion,
          publicContentConfirmed: true,
        },
        key("publish/" + item.kind),
      );
      d = await checkpoint(item.kind, "published");
    }
    if (item.final === "OFFLINE") {
      await api.unpublish(
        record.id,
        {
          expectedPublicationVersion: d.publicationVersion,
          reason: "验证下架及公共不可见",
        },
        key("unpublish/" + item.kind),
      );
      d = await checkpoint(item.kind, "offline");
    }
    if (item.kind === "software") {
      const v2 = await upload(
        record.id,
        "sample-v2.pdf",
        "preview",
        "application/pdf",
      );
      const changed = structuredClone(d.content);
      changed.summary += " 此句属于尚未发布的第二版草稿。";
      changed.materials[0] = {
        ...changed.materials[0],
        versionId: randomUUID(),
        versionLabel: "v2",
        preview: { kind: "pdf", assetId: v2.assetId, pageCount: v2.pageCount! },
      };
      await api.save(record.id, {
        expectedDraftVersion: d.draftVersion,
        content: changed,
      });
      d = await checkpoint(item.kind, "unpublished-v2");
    }
    record.complete = true;
    await persist();
    journal.results.push({
      productId: record.id,
      name: item.name,
      template: item.kind,
      state: d.publicationState,
      hasUnpublishedChanges: d.hasUnpublishedChanges,
      result: "CREATED",
    });
  } catch (e) {
    journal.results.push({
      name: item.name,
      result: "CONFLICT_OR_FAILED",
      message: e instanceof Error ? e.message : String(e),
    });
    process.exitCode = 1;
  }
}
await persist();
console.log(
  JSON.stringify(
    {
      target: base.origin,
      sessionId: health.sessionId,
      records: journal.results,
      note: "原27主档不修改；进程重启后需重新运行脚本。",
    },
    null,
    2,
  ),
);
