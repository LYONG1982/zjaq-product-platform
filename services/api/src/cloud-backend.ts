import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import type { Domain, Responses, ProductRecord } from "@zj/contracts";
import type { Backend, Query } from "../../domain/src/backend";
import { filters } from "../../domain/src/backend";
import { DomainEngine, type Release, type Meta } from "../../domain/src/engine";
import { actorContext } from "../../domain/src/identity";
import { requireValue, clone } from "../../domain/src/errors";
import { AssetStore } from "../../mock-api/src/assets";
import { type Repository, type Transaction } from "./repository";
import {
  authenticate,
  identityFor,
  subjectKey,
  type IdentityProvider,
} from "./auth";
import {
  CloudAssets,
  advance,
  persisted,
  type PrivateStorage,
  type StoredAsset,
} from "./cloud-assets";
type Category = Omit<Responses["AdminCategory"], "referenceCount">;
type Catalog = {
  categories: Category[];
  references: Record<
    string,
    { count: number; templates: Record<string, number> }
  >;
};
type History = {
  materials: [string, [string, Domain["MaterialRef"]][]][];
  owners: [string, string][];
};
type StoredDraft = { content: Domain["DraftContent"]; meta?: Meta };
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
function references(
  p: ProductRecord | undefined,
  releases: Map<string, Release>,
) {
  const refs = new Map<string, Set<string>>();
  if (p) {
    const content = [
      p.draft,
      ...[p.activeReleaseId, p.lastReleaseId]
        .filter((x): x is string => !!x)
        .map((id) => releases.get(id)!.content),
    ];
    for (const c of content) {
      const set = refs.get(c.categoryId) ?? new Set();
      set.add(c.templateId);
      refs.set(c.categoryId, set);
    }
  }
  return refs;
}
/** Each command loads a single aggregate. The control record serializes cross-aggregate invariants. */
export class CloudBackend implements Backend {
  readonly provider = "cloudbase" as const;
  readonly files: CloudAssets;
  constructor(
    readonly repo: Repository,
    readonly identity: IdentityProvider,
    storage: PrivateStorage,
  ) {
    this.files = new CloudAssets(repo, storage);
  }
  async throttle(ip: string) {
    const minute = Math.floor(Date.now() / 60000),
      id = hash(ip + ":" + minute);
    await this.repo.transaction(async (tx) => {
      const row = await tx.get<{ count: number }>("rates", id);
      requireValue(
        (row?.count ?? 0) < 600,
        429,
        "RATE_LIMITED",
        "请求过于频繁，请稍后重试",
      );
      await tx.set("rates", id, {
        count: (row?.count ?? 0) + 1,
        expiresAt: new Date((minute + 120) * 60000),
      });
    });
  }
  authenticate(header: string | undefined) {
    return authenticate(this.repo, this.identity, header);
  }
  private async engine(
    tx: Transaction,
    ids: string[] = [],
    assets: StoredAsset[] = [],
  ) {
    const local = new AssetStore(),
      engine = new DomainEngine(local);
    try {
      const catalog = await tx.get<Catalog>("control", "catalog");
      requireValue(catalog, 503, "NOT_INITIALIZED", "分类尚未初始化");
      catalog.categories.forEach((c) =>
        engine.categoryRecords.set(c.id, clone(c)),
      );
      for (const id of ids) {
        const stored = await tx.get<Omit<ProductRecord, "draft">>(
          "products",
          id,
        );
        if (!stored) continue;
        const d = await tx.get<StoredDraft>("drafts", id);
        requireValue(d, 500, "DATA_INTEGRITY", "草稿缺失");
        const product = { ...stored, draft: d.content };
        engine.products.set(id, product);
        if (d.meta) engine.metadata.set(id, d.meta);
        for (const releaseId of new Set(
          [stored.activeReleaseId, stored.lastReleaseId].filter(
            (v): v is string => !!v,
          ),
        )) {
          const r = await tx.get<Release>("releases", releaseId);
          requireValue(r, 500, "DATA_INTEGRITY", "发布快照缺失");
          engine.releases.set(r.id, r);
        }
        const history = await tx.get<History>("history", id);
        if (history) {
          history.materials.forEach(([k, v]) =>
            engine.materialHistory.set(k, new Map(v)),
          );
          history.owners.forEach(([k, v]) =>
            engine.materialVersionOwners.set(k, v),
          );
        }
      }
      for (const a of assets)
        local.uploads.set(a.uploadId, { ...a, path: "", writing: false });
      return { engine, local, catalog };
    } catch (e) {
      await rm(local.directory, { recursive: true, force: true });
      throw e;
    }
  }
  private async read<T>(ids: string[], fn: (engine: DomainEngine) => T) {
    const { engine, local } = await this.engine(this.repo, ids);
    try {
      return fn(engine);
    } finally {
      await rm(local.directory, { recursive: true, force: true });
    }
  }
  private async listing<T>(fn: (engine: DomainEngine) => T) {
    const records =
      await this.repo.list<Omit<ProductRecord, "draft">>("products");
    return this.read(
      records.map((p) => p.productId),
      fn,
    );
  }
  listProducts(q: Query) {
    return this.listing((e) => filters(e).listProducts(q));
  }
  listPublicProducts(q: Query) {
    return this.listing((e) => filters(e).listPublicProducts(q));
  }
  listMaterials(q: Query) {
    return this.listing((e) => filters(e).listMaterials(q));
  }
  async listAudit(q: Query) {
    return (await this.repo.list<Responses["AuditEvent"]>("audit"))
      .filter(
        (e) =>
          (!q.productId || q.productId === e.targetId) &&
          (!q.action || q.action === e.action),
      )
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          a.eventId.localeCompare(b.eventId),
      );
  }
  async categories() {
    const c = await this.repo.get<Catalog>("control", "catalog");
    requireValue(c, 503, "NOT_INITIALIZED", "分类尚未初始化");
    return c.categories
      .map((x) => ({ ...x, referenceCount: c.references[x.id]?.count ?? 0 }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async users() {
    requireValue(
      actorContext.getStore()?.role === "ADMIN",
      403,
      "FORBIDDEN",
      "仅管理员可查看账号",
    );
    return this.repo.list<Responses["AdminUser"]>("users");
  }
  draft(id: string) {
    return this.read([id], (e) => e.draft(id));
  }
  preview(id: string, version: number) {
    return this.read([id], (e) => e.preview(id, version));
  }
  publicProduct(id: string) {
    return this.read([id], (e) => e.publicProduct(id));
  }
  publicCategories() {
    return this.listing((e) => e.publicCategories());
  }
  manifest(id: string, materialId: string) {
    return this.read([id], (e) => e.manifest(id, materialId));
  }
  previewAsset(
    id: string,
    materialId: string,
    releaseId: string,
    versionId: string,
    part: string,
  ) {
    return this.read([id], (e) =>
      e.previewAsset(id, materialId, releaseId, versionId, part),
    );
  }
  mediaAsset(id: string, mediaId: string, releaseId: string) {
    return this.read([id], (e) => e.mediaAsset(id, mediaId, releaseId));
  }
  private async command(
    op: "create" | "save" | "publish" | "unpublish" | "upload",
    id: string | undefined,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ): Promise<any> {
    const identity = actorContext.getStore();
    requireValue(identity, 401, "SESSION_EXPIRED", "请重新登录");
    const content =
      (body as { content?: Domain["DraftContent"] })?.content ??
      (id
        ? (await this.repo.get<StoredDraft>("drafts", id))?.content
        : undefined);
    const assetIds =
      content && (op === "save" || op === "publish")
        ? [
            ...content.media.map((m) => m.assetId),
            ...content.materials.flatMap((m) => [
              ...(m.sourceAssetId ? [m.sourceAssetId] : []),
              ...(m.preview.kind === "pdf"
                ? [m.preview.assetId]
                : m.preview.pages.map((p) => p.assetId)),
            ]),
          ]
        : [];
    const assets: StoredAsset[] = [];
    for (const assetId of new Set(assetIds)) {
      const asset = await this.repo.get<StoredAsset>("assets", assetId);
      if (asset) assets.push(asset);
    }
    return this.repo.transaction(async (tx) => {
      const current = await identityFor(tx, identity.subjectId);
      return actorContext.run(current, async () => {
        const { engine, local, catalog } = await this.engine(
          tx,
          id ? [id] : [],
          assets,
        );
        try {
          const counter = await tx.get<{ next: number }>("control", "counter");
          requireValue(counter, 503, "NOT_INITIALIZED", "编号计数器尚未初始化");
          engine.counter = counter.next;
          const operation =
            op === "create"
              ? "POST /admin/products"
              : op === "upload"
                ? "POST /admin/uploads"
                : "POST /admin/products/" + id + "/" + op;
          const onceKey = current.userId + " " + operation + " " + key,
            idempotencyId = hash(onceKey);
          if (key) {
            const prior = await tx.get<{ hash: string; result: unknown }>(
              "idempotency",
              idempotencyId,
            );
            if (prior) engine.idempotency.set(onceKey, prior);
          }
          const before = id ? clone(engine.product(id)) : undefined,
            previousRefs = references(before, engine.releases);
          let result;
          if (op === "create") result = engine.create(body, key, requestId);
          else if (op === "save") result = engine.save(id!, body, requestId);
          else if (op === "publish")
            result = engine.publish(id!, body, key, requestId);
          else if (op === "unpublish")
            result = engine.unpublish(id!, body, key, requestId);
          else result = engine.createUpload(body, key);
          // An idempotent replay performs no writes, including no duplicate audit event.
          const prior = key
            ? await tx.get("idempotency", idempotencyId)
            : undefined;
          if (prior) return result;
          const productId =
            op === "create"
              ? (result as Responses["AdminDraft"]).productId
              : id!;
          if (op !== "upload") {
            const product = engine.product(productId),
              { draft, ...master } = product;
            const nextRefs = references(product, engine.releases);
            for (const [cat, values] of previousRefs) {
              const ref = catalog.references[cat];
              if (ref) {
                ref.count--;
                for (const template of values)
                  ref.templates[template] = (ref.templates[template] ?? 0) - 1;
              }
            }
            for (const [cat, values] of nextRefs) {
              const ref = catalog.references[cat] ?? {
                count: 0,
                templates: {},
              };
              ref.count++;
              for (const template of values)
                ref.templates[template] = (ref.templates[template] ?? 0) + 1;
              catalog.references[cat] = ref;
            }
            await tx.set("products", productId, master);
            await tx.set("drafts", productId, {
              content: draft,
              ...(engine.metadata.has(productId)
                ? { meta: engine.metadata.get(productId) }
                : {}),
            });
            await tx.set("history", productId, {
              materials: [...engine.materialHistory].map(([k, v]) => [
                k,
                [...v],
              ]),
              owners: [...engine.materialVersionOwners],
            });
            if (op === "publish") {
              const release = engine.releases.get(product.activeReleaseId!)!;
              requireValue(
                !(await tx.get("releases", release.id)),
                409,
                "RELEASE_EXISTS",
                "发布快照已存在",
              );
              await tx.set("releases", release.id, release);
            }
            await tx.set("control", "catalog", catalog);
            if (op === "create")
              await tx.set("control", "counter", { next: engine.counter });
          } else {
            const r = result as Responses["UploadIntentResult"];
            const u = local.uploads.get(r.uploadId);
            requireValue(u, 500, "UPLOAD_STATE", "上传任务未生成");
            const quotaId = "upload-" + new Date().toISOString().slice(0, 10);
            const quota = (await tx.get<{ count: number; bytes: number }>(
              "control",
              quotaId,
            )) ?? { count: 0, bytes: 0 };
            requireValue(
              quota.count < 500 &&
                quota.bytes + u.declaredSize <= 256 * 1024 * 1024,
              429,
              "UPLOAD_QUOTA",
              "今日上传额度已用完，请联系维护人员",
            );
            await tx.set("control", quotaId, {
              count: quota.count + 1,
              bytes: quota.bytes + u.declaredSize,
            });
            await tx.set("assets", u.assetId, persisted(u));
            await tx.set("uploads", u.uploadId, { assetId: u.assetId });
          }
          for (const event of engine.events)
            await tx.set("audit", event.eventId, event);
          if (key)
            await tx.set(
              "idempotency",
              idempotencyId,
              engine.idempotency.get(onceKey)!,
            );
          await advance(tx);
          return result;
        } finally {
          await rm(local.directory, { recursive: true, force: true });
        }
      });
    });
  }
  create(body: unknown, key: string | undefined, requestId: string) {
    return this.command("create", undefined, body, key, requestId);
  }
  save(id: string, body: unknown, requestId: string) {
    return this.command("save", id, body, undefined, requestId);
  }
  publish(
    id: string,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command("publish", id, body, key, requestId);
  }
  unpublish(
    id: string,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    return this.command("unpublish", id, body, key, requestId);
  }
  createUpload(body: unknown, key: string | undefined) {
    return this.command(
      "upload",
      (body as Domain["UploadIntent"]).productId,
      body,
      key,
      "upload",
    );
  }
  async writeCategory(
    id: string | undefined,
    body: unknown,
    requestId: string,
  ) {
    const identity = actorContext.getStore();
    requireValue(identity, 401, "SESSION_EXPIRED", "请重新登录");
    return this.repo.transaction(async (tx) => {
      const current = await identityFor(tx, identity.subjectId);
      return actorContext.run(current, async () => {
        const { engine, local, catalog } = await this.engine(tx);
        try {
          const data = body as Domain["CategoryWrite"],
            refs = id ? catalog.references[id] : undefined;
          requireValue(
            !refs?.count || data.enabled,
            409,
            "CATEGORY_IN_USE",
            "分类被产品引用，不能停用",
          );
          requireValue(
            !refs ||
              Object.entries(refs.templates).every(
                ([k, n]) => !n || data.allowedTemplateIds?.includes(k),
              ),
            409,
            "CATEGORY_IN_USE",
            "已有产品仍在使用被移除的模板",
          );
          const category = engine.writeCategory(id, body, requestId);
          catalog.categories = engine.categories;
          await advance(tx);
          await tx.set("control", "catalog", catalog);
          const { referenceCount, ...record } = category;
          await tx.set("categories", category.id, record);
          for (const e of engine.events) await tx.set("audit", e.eventId, e);
          return { ...category, referenceCount: refs?.count ?? 0 };
        } finally {
          await rm(local.directory, { recursive: true, force: true });
        }
      });
    });
  }
  async writeUser(id: string | undefined, body: unknown, requestId: string) {
    const identity = actorContext.getStore();
    requireValue(identity, 401, "SESSION_EXPIRED", "请重新登录");
    return this.repo.transaction(async (tx) => {
      const current = await identityFor(tx, identity.subjectId);
      return actorContext.run(current, async () => {
        const { engine, local } = await this.engine(tx);
        try {
          const guard = await tx.get<{ enabledAdmins: number }>(
            "control",
            "admins",
          );
          requireValue(guard, 503, "NOT_INITIALIZED", "管理员尚未初始化");
          const data = body as Domain["AdminUserWrite"];
          requireValue(
            typeof data?.subjectId === "string",
            400,
            "INVALID_ARGUMENT",
            "身份主体无效",
          );
          const priorSubject = await tx.get<{ userId: string }>(
            "subjects",
            subjectKey(data.subjectId.trim()),
          );
          requireValue(
            !priorSubject || priorSubject.userId === id,
            409,
            "DUPLICATE_SUBJECT",
            "身份主体已存在",
          );
          const old = id
            ? await tx.get<Responses["AdminUser"]>("users", id)
            : undefined;
          if (old) engine.users.set(old.userId, old);
          const oldAdmin = old?.enabled && old.role === "ADMIN" ? 1 : 0;
          for (let i = 0; i < Math.min(2, guard.enabledAdmins - oldAdmin); i++)
            engine.users.set("guard-" + i, {
              userId: "guard-" + i,
              subjectId: "guard-" + i,
              displayName: "guard",
              role: "ADMIN",
              enabled: true,
              version: 1,
            });
          const user = engine.writeUser(id, body, requestId);
          const count =
            guard.enabledAdmins -
            oldAdmin +
            (user.enabled && user.role === "ADMIN" ? 1 : 0);
          requireValue(count >= 1, 409, "LAST_ADMIN", "至少保留一个管理员");
          await advance(tx);
          await tx.set("users", user.userId, user);
          await tx.set("subjects", subjectKey(user.subjectId), {
            userId: user.userId,
          });
          await tx.set("control", "admins", { enabledAdmins: count });
          for (const e of engine.events) await tx.set("audit", e.eventId, e);
          return user;
        } finally {
          await rm(local.directory, { recursive: true, force: true });
        }
      });
    });
  }
  uploadResult(id: string) {
    return this.files.result(id);
  }
  put(id: string, req: Parameters<CloudAssets["put"]>[1]) {
    return this.files.put(id, req);
  }
  complete(id: string) {
    return this.files.complete(id);
  }
  bytes(productId: string, assetId: string) {
    return this.files.bytes(productId, assetId);
  }
}
