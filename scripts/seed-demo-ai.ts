import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "../packages/api-client/src/index";
import type { Domain, AdminDraft } from "@zj/contracts";
const base = new URL(
  process.env.DEMO_API_BASE ?? "http://127.0.0.1:3403/api/v1",
);
if (
  base.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(base.hostname) ||
  base.pathname !== "/api/v1" ||
  base.search ||
  base.hash ||
  base.username ||
  base.password
)
  throw new Error("Demo seeding requires a loopback Mock API");
const health = await fetch(new URL("/health", base)).then((r) => r.json());
if (health.provider !== "mock" || !/^[-a-f0-9]{36}$/.test(health.sessionId))
  throw new Error("Not an isolated Mock service");
const api = createClient(base.toString(), undefined, "local-mock");
const key = (s: string) =>
  createHash("sha256")
    .update(health.sessionId + " demo-ai " + s)
    .digest("hex");
const dir = new URL("../work/round03/demo-seed/", import.meta.url);
await mkdir(dir, { recursive: true });
const journal = new URL(health.sessionId + ".json", dir);
const fingerprint = (d: AdminDraft) =>
  createHash("sha256").update(JSON.stringify(d)).digest("hex");
let state: { id: string; fingerprint: string; done: boolean } | undefined;
try {
  state = JSON.parse(await readFile(journal, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
if (state) {
  const d = (await api.draft(state.id)).data;
  if (state.done || state.fingerprint !== fingerprint(d)) {
    console.log(
      JSON.stringify({
        skipped: true,
        productId: state.id,
        userChangesPreserved: true,
      }),
    );
    process.exit(0);
  }
}
const existing = await api.products({ q: "【Demo】资料问答助手", limit: 100 });
if (!state && existing.data.some((p) => p.name === "【Demo】资料问答助手"))
  throw new Error("An unjournaled Demo already exists; manual review required");
let draft = state
  ? (await api.draft(state.id)).data
  : (
      await api.create(
        {
          name: "【Demo】资料问答助手",
          owner: "本地演示",
          aliases: ["知识查询演示"],
          categoryId: "ai",
          templateId: "ai",
          templateVersion: 1,
        },
        key("create"),
      )
    ).data;
state = { id: draft.productId, fingerprint: fingerprint(draft), done: false };
await writeFile(journal, JSON.stringify(state, null, 2));
async function upload(fileName: string, contentType: string) {
  const bytes = await readFile(
    new URL("../tests/fixtures/demo-ai/" + fileName, import.meta.url),
  );
  const intent = (
    await api.createUpload(
      {
        productId: draft.productId,
        purpose: "preview",
        fileName,
        contentType,
        size: bytes.length,
      },
      key(fileName),
    )
  ).data;
  let result = (await api.uploadStatus(intent.uploadId)).data;
  if (result.status === "UPLOADING")
    await api.putBytes(intent.uploadId, new Blob([new Uint8Array(bytes)]));
  result = (await api.completeUpload(intent.uploadId)).data;
  if (result.status !== "READY")
    throw new Error("Fixture rejected: " + result.error);
  return result;
}
const pdf = await upload("资料问答助手_Demo.pdf", "application/pdf"),
  pages = [];
for (let i = 1; i <= 3; i++)
  pages.push({
    pageIndex: i,
    alt: "资料问答助手 Demo 第 " + i + " 页",
    assetId: (await upload("page-" + i + ".png", "image/png")).assetId,
  });
const items = (pairs: string[][]) =>
  pairs.map(([title, text], i) => ({ id: "item-" + i, title, text }));
const materials: Domain["MaterialRef"][] = [
  {
    materialId: "demo-introduction",
    versionId: "demo-introduction-v1",
    name: "资料问答助手 · 产品介绍",
    kind: "brochure",
    versionLabel: "Demo v1",
    preview: { kind: "pdf", assetId: pdf.assetId, pageCount: pdf.pageCount! },
  },
  {
    materialId: "demo-slides",
    versionId: "demo-slides-v1",
    name: "资料问答助手 · 分页图集",
    kind: "presentation",
    versionLabel: "Demo v1",
    preview: { kind: "images", pages },
  },
];
draft = (
  await api.save(draft.productId, {
    expectedDraftVersion: draft.draftVersion,
    content: {
      ...draft.content,
      tagline: "从资料中找答案，让出处清晰可查。",
      summary:
        "将分散的业务文档整理为可检索的资料集合，通过自然语言查找相关内容，并按来源查看原文。适合展示内部知识查询、新人学习和资料更新后的内容核对流程。",
      audiences: "知识维护人员、培训人员和业务支持人员。",
      problemValues: items([
        ["资料集中检索", "将分散资料整理到同一查询入口。"],
        ["回答有据可查", "查看答案草稿对应的来源片段。"],
        ["核对当前内容", "按当前资料版本确认引用与描述。"],
      ]),
      features: items([
        ["按问题查找", "通过自然语言问题寻找相关资料。"],
        ["关联来源", "将要点与资料名称、原文片段关联。"],
        ["整理与复核", "汇总多份资料，交由人工确认后使用。"],
      ]),
      scenarios: items([
        ["新人学习", "查阅制度和业务说明，理解相关概念。"],
        ["业务答复", "整理回复依据，核对资料原文。"],
        ["资料维护", "检查更新后的引用与内容是否一致。"],
      ]),
      technical: {
        inputs: "已整理的示例文档与用户问题；本演示不接收真实敏感资料。",
        outputs: "答案草稿、来源片段和资料名称。答案不代替原文。",
        humanReview:
          "答案可能遗漏或理解偏差；涉及重要决定时，由使用者核对原文。",
        deployment: "",
        evaluationConditions: "",
      },
      boundaries:
        "本产品为虚构展示样例，不表示本平台已经提供 AI 问答服务。示例用于本地阅读与流程验证，不含真实产品指标、客户或商业承诺。",
      materials,
    },
  })
).data;
state.fingerprint = fingerprint(draft);
await writeFile(journal, JSON.stringify(state, null, 2));
await api.publish(
  draft.productId,
  {
    expectedDraftVersion: draft.draftVersion,
    expectedPublicationVersion: draft.publicationVersion,
    publicContentConfirmed: true,
  },
  key("publish"),
);
state.done = true;
state.fingerprint = fingerprint((await api.draft(draft.productId)).data);
await writeFile(journal, JSON.stringify(state, null, 2));
console.log(
  JSON.stringify({
    productId: draft.productId,
    pdfPages: 3,
    imagePages: 3,
    scope: "local-fictional-only",
  }),
);
