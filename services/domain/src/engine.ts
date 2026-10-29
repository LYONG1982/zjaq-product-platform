import { randomUUID, createHash } from "node:crypto";
import type {
  AdminDraft,
  AdminProductRow,
  CreateProduct,
  DraftContent,
  Domain,
  ProductRecord,
  Responses,
} from "@zj/contracts";
import {
  validateCreation,
  validateTemplateContent,
} from "@zj/template-registry";
import categories from "../../../data/categories.seed.json";

import { AssetStore } from "../../mock-api/src/assets";
import {
  AppError,
  requireValue,
  invalidFields,
  validateBody,
  canonical,
  clone,
  type FieldError,
} from "./errors";
export { identity } from "./identity";
import { actorContext, identity } from "./identity";
import { templates } from "@zj/template-registry";
import { normalizedModel, productCode, productCodePrefix } from "./product-code";
import { isPublicProductId } from "./public-id";
export type Release = {
  id: string;
  productId: string;
  sequence: number;
  content: DraftContent;
  publishedAt: string;
  publishedBy: string;
};
export type Meta = {
  updatedAt: string;
  updatedBy: string;
  unpublishedAt: string | null;
};
type Material = Domain["MaterialRef"];
export class DomainEngine {
  readonly categoryRecords = new Map<
    string,
    Omit<Responses["AdminCategory"], "referenceCount">
  >();
  readonly users = new Map<string, Responses["AdminUser"]>();
  get categories() {
    return [...this.categoryRecords.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
  }
  readonly assets: Pick<AssetStore, "asset" | "create">;
  readonly products = new Map<string, ProductRecord>();
  readonly releases = new Map<string, Release>();
  readonly events: Responses["AuditEvent"][] = [];
  readonly sessionId = randomUUID();
  counter = 1;
  readonly codeCounters = new Map<string, number>();
  readonly modelOwners = new Map<string, string>();
  readonly metadata = new Map<string, Meta>();
  readonly materialHistory = new Map<string, Map<string, Material>>();
  readonly materialVersionOwners = new Map<string, string>();
  readonly idempotency = new Map<string, { hash: string; result: unknown }>();
  // A direct test seam only: never selectable through HTTP, query strings or environment variables.
  constructor(
    assets: Pick<AssetStore, "asset" | "create">,
    private beforeCommit?: (action: string) => void,
    private allowMockActor = false,
  ) {
    this.assets = assets;
    this.categoryRecords.clear();
    this.users.clear();
  }
  private actor() {
    const value = actorContext.getStore();
    if (value) return value;
    requireValue(this.allowMockActor, 401, "SESSION_EXPIRED", "缺少可信身份");
    return identity;
  }
  product(id: string) {
    const p = this.products.get(id);
    requireValue(p, 404, "RESOURCE_UNAVAILABLE", "产品不存在");
    return p;
  }
  assertProductWritable(id: string) {
    requireValue(!this.product(id).deletedAt, 409, "PRODUCT_REMOVED", "产品已移除，请由管理员恢复后操作");
  }
  assertProductReadable(id: string) {
    const product = this.product(id);
    requireValue(!product.deletedAt || actorContext.getStore()?.role === "ADMIN", 404, "RESOURCE_UNAVAILABLE", "产品不存在或已移除");
  }
  assertRemovedProductsAccess() { this.adminOnly(); }
  draft(id: string): AdminDraft {
    this.assertProductReadable(id);
    const p = this.product(id),
      m = this.metadata.get(id);
    return clone({
      productId: id,
      draftVersion: p.draftVersion,
      publicationState: p.publicationState,
      publicationVersion: p.publicationVersion,
      releaseSequence: p.releaseSequence,
      lastPublishedDraftVersion: p.lastPublishedDraftVersion ?? null,
      hasUnpublishedChanges:
        p.lastPublishedDraftVersion != null &&
        p.draftVersion !== p.lastPublishedDraftVersion,
      content: p.draft,
      updatedAt: m?.updatedAt ?? null,
      updatedBy: m?.updatedBy ?? null,
      deletedAt: p.deletedAt ?? null, deletedBy: p.deletedBy ?? null, deletionReason: p.deletionReason ?? null,
    });
  }
  row(p: ProductRecord): AdminProductRow {
    const d = this.draft(p.productId);
    return {
      productId: p.productId,
      name: p.draft.name,
      publishedName: p.lastReleaseId
        ? (this.releases.get(p.lastReleaseId)?.content.name ?? null)
        : null,
      categoryId: p.draft.categoryId,
      owner: p.draft.owner,
      publicationState: d.publicationState,
      publicationVersion: d.publicationVersion,
      draftVersion: d.draftVersion,
      hasUnpublishedChanges: d.hasUnpublishedChanges,
      updatedAt: d.updatedAt,
      deletedAt: p.deletedAt ?? null, deletedBy: p.deletedBy ?? null, deletionReason: p.deletionReason ?? null,
    };
  }
  adminCategories() {
    return this.categories.map((c) => ({
      ...clone(c),
      referenceCount: [...this.products.values()].filter(
        (p) =>
          p.draft.categoryId === c.id ||
          (p.activeReleaseId &&
            this.releases.get(p.activeReleaseId)?.content.categoryId === c.id) ||
          (p.lastReleaseId && this.releases.get(p.lastReleaseId)?.content.categoryId === c.id),
      ).length,
    }));
  }
  private adminOnly() {
    requireValue(
      this.actor().role === "ADMIN",
      403,
      "FORBIDDEN",
      "仅管理员可维护此内容",
    );
  }
  private managementEvent(action: string, targetId: string, requestId: string) {
    this.events.push({
      eventId: randomUUID(),
      actorId: this.actor().userId,
      actorName: this.actor().displayName,
      action,
      targetId,
      requestId,
      createdAt: new Date().toISOString(),
      draftVersion: null,
      publicationVersion: null,
      releaseSequence: null,
    });
  }
  writeCategory(id: string | undefined, body: unknown, requestId: string) {
    this.adminOnly();
    const b = validateBody<Domain["CategoryWrite"]>("CategoryWrite", body);
    const old = id ? this.categoryRecords.get(id) : undefined;
    requireValue(!id || old, 404, "RESOURCE_UNAVAILABLE", "分类不存在");
    if (old)
      requireValue(
        b.expectedVersion === old.version,
        409,
        "VERSION_CONFLICT",
        "分类已修改，请重新加载",
      );
    requireValue(
      b.name.trim() &&
        b.shortName.trim() &&
        b.allowedTemplateIds.includes(b.defaultTemplateId) &&
        b.allowedTemplateIds.every((x) =>
          templates.some((t) => t.id === x && t.enabledForCreate),
        ),
      422,
      "VALIDATION_FAILED",
      "请填写名称，并选择兼容的默认模板",
    );
    requireValue(
      !this.categories.some(
        (c) => c.id !== id && c.name.trim() === b.name.trim(),
      ),
      409,
      "DUPLICATE_CATEGORY",
      "分类名称已存在",
    );
    if (id) {
      const references = [...this.products.values()]
        .flatMap((p) => [
          p.draft,
          ...[p.activeReleaseId, p.lastReleaseId]
            .filter((x): x is string => !!x)
            .map((x) => this.releases.get(x)!.content),
        ])
        .filter((c) => c.categoryId === id);
      requireValue(
        !references.length || b.enabled,
        409,
        "CATEGORY_IN_USE",
        "分类被产品引用，不能停用",
      );
      requireValue(
        references.every((c) => b.allowedTemplateIds.includes(c.templateId)),
        409,
        "CATEGORY_IN_USE",
        "分类仍有产品使用被移除的模板",
      );
    }
    const { expectedVersion, ...data } = b;
    const category = {
      ...data,
      name: b.name.trim(),
      shortName: b.shortName.trim(),
      id: id ?? "category-" + randomUUID(),
      version: (old?.version ?? 0) + 1,
    };
    this.beforeCommit?.("CATEGORY_WRITE");
    this.categoryRecords.set(category.id, clone(category));
    this.managementEvent(
      old ? "UPDATE_CATEGORY" : "CREATE_CATEGORY",
      category.id,
      requestId,
    );
    return this.adminCategories().find((c) => c.id === category.id)!;
  }
  adminUsers() {
    this.adminOnly();
    return clone([...this.users.values()]);
  }
  writeUser(id: string | undefined, body: unknown, requestId: string) {
    this.adminOnly();
    const b = validateBody<Domain["AdminUserWrite"]>("AdminUserWrite", body);
    const old = id ? this.users.get(id) : undefined;
    requireValue(!id || old, 404, "RESOURCE_UNAVAILABLE", "账号不存在");
    if (old) {
      requireValue(
        b.expectedVersion === old.version,
        409,
        "VERSION_CONFLICT",
        "账号已修改，请重新加载",
      );
      requireValue(
        b.subjectId === old.subjectId,
        422,
        "VALIDATION_FAILED",
        "身份主体创建后不能变更",
      );
    }
    requireValue(
      b.displayName.trim() && b.subjectId.trim(),
      422,
      "VALIDATION_FAILED",
      "请填写身份主体和显示名称",
    );
    requireValue(
      ![...this.users.values()].some(
        (u) => u.userId !== id && u.subjectId === b.subjectId.trim(),
      ),
      409,
      "DUPLICATE_SUBJECT",
      "该身份主体已存在",
    );
    if (
      old?.role === "ADMIN" &&
      old.enabled &&
      (!b.enabled || b.role !== "ADMIN")
    )
      requireValue(
        [...this.users.values()].filter((u) => u.enabled && u.role === "ADMIN")
          .length > 1,
        409,
        "LAST_ADMIN",
        "至少保留一个可用管理员",
      );
    const { expectedVersion, ...data } = b;
    const user = {
      ...data,
      subjectId: b.subjectId.trim(),
      displayName: b.displayName.trim(),
      userId: id ?? randomUUID(),
      version: (old?.version ?? 0) + 1,
    };
    this.beforeCommit?.("USER_WRITE");
    this.users.set(user.userId, clone(user));
    this.managementEvent(
      old ? "UPDATE_USER" : "CREATE_USER",
      user.userId,
      requestId,
    );
    return clone(user);
  }
  once<T>(
    operation: string,
    key: string | undefined,
    body: unknown,
    run: () => T,
  ): T {
    requireValue(
      key &&
        key.length >= 16 &&
        key.length <= 120 &&
        !/[\u0000-\u001f]/.test(key),
      400,
      "INVALID_ARGUMENT",
      "需要有效的 Idempotency-Key",
    );
    const id = this.actor().userId + " " + operation + " " + key,
      hash = createHash("sha256").update(canonical(body)).digest("hex"),
      previous = this.idempotency.get(id);
    if (previous) {
      requireValue(
        previous.hash === hash,
        409,
        "IDEMPOTENCY_CONFLICT",
        "该操作标识已用于不同内容，请确认后重新操作",
      );
      return clone(previous.result) as T;
    }
    requireValue(
      this.idempotency.size < 10000,
      429,
      "RATE_LIMITED",
      "本地会话操作额度已满",
    );
    const result = run();
    this.idempotency.set(id, { hash, result: clone(result) });
    return result;
  }
  private commit(
    action: string,
    p: ProductRecord,
    requestId: string,
    release?: Release,
    reason?: string,
  ) {
    this.beforeCommit?.(action);
    const now = new Date().toISOString();
    this.products.set(p.productId, clone(p));
    if (release) this.releases.set(release.id, clone(release));
    this.metadata.set(p.productId, {
      updatedAt: now,
      updatedBy: this.actor().userId,
      unpublishedAt:
        action === "UNPUBLISH"
          ? now
          : (this.metadata.get(p.productId)?.unpublishedAt ?? null),
    });
    this.events.push({
      eventId: randomUUID(),
      actorId: this.actor().userId,
      actorName: this.actor().displayName,
      action,
      targetId: p.productId,
      draftVersion: p.draftVersion,
      publicationVersion: p.publicationVersion,
      releaseSequence: p.releaseSequence,
      requestId,
      createdAt: now,
      ...(reason ? { reason } : {}),
    });
  }
  create(body: unknown, key: string | undefined, requestId: string) {
    return this.once("POST /admin/products", key, body, () => {
      const b = validateBody<CreateProduct>("CreateProduct", body);
      invalidFields(validateCreation(b, this.categories));
      requireValue(b.model.trim(), 422, "VALIDATION_FAILED", "请填写产品型号");
      requireValue(!this.modelOwners.has(normalizedModel(b.model)) && ![...this.products.values()].some((p) => p.draft.model && normalizedModel(p.draft.model) === normalizedModel(b.model)), 409, "MODEL_CONFLICT", "产品型号已存在");
      const prefix = productCodePrefix(b.categoryId, b.productType, b.ownership);
      const next = this.codeCounters.get(prefix) ?? 1;
      const id = productCode(b.categoryId, b.productType, b.ownership, next);
      requireValue(!this.products.has(id), 409, "INVALID_STATE", "编号冲突");
      const p: ProductRecord = {
        productId: id,
        publicId: randomUUID(),
        isDemo: this.allowMockActor,
        pilotOrder: null,
        publicationState: "DRAFT",
        activeReleaseId: null,
        lastReleaseId: null,
        publicationVersion: 0,
        releaseSequence: 0,
        draftVersion: 1,
        lastPublishedDraftVersion: null,
        draft: {
          ...clone(b),
          name: b.name.trim(),
          owner: b.owner.trim(),
          model: b.model.trim(),
          aliases: b.aliases ?? [],
          tagline: "",
          summary: "",
          audiences: "",
          problemValues: [],
          features: [],
          scenarios: [],
          technical: {},
          boundaries: "",
          media: [],
          materials: [],
        },
      };
      this.commit("CREATE", p, requestId);
      this.codeCounters.set(prefix, next + 1);
      this.modelOwners.set(normalizedModel(b.model), id);
      return this.draft(id);
    });
  }
  private validateContent(id: string, c: DraftContent, publish = false) {
    const p = this.product(id);
    const errors: FieldError[] = validateTemplateContent(
      c,
      publish ? "publish-fields" : "draft",
      templates,
      this.categories,
    );
    if (
      c.templateId !== p.draft.templateId ||
      c.templateVersion !== p.draft.templateVersion
    )
      errors.push({
        path: "/templateId",
        message: "创建后不能切换模板或模板版本",
      });
    const category = this.categories.find((x) => x.id === c.categoryId);
    if (!category?.enabled)
      errors.push({ path: "/categoryId", message: "分类已停用或不存在" });
    if (!c.name.trim())
      errors.push({ path: "/name", message: "请填写产品名称" });
    if (publish && !c.model?.trim()) errors.push({ path: "/model", message: "发布前请补齐产品型号" });
    if (publish && !c.productType) errors.push({ path: "/productType", message: "发布前请选择产品类型" });
    if (publish && !c.ownership) errors.push({ path: "/ownership", message: "发布前请选择产品属性" });
    if (c.model?.trim() && [...this.products.values()].some((other) => other.productId !== id && other.draft.model && normalizedModel(other.draft.model) === normalizedModel(c.model!)))
      errors.push({ path: "/model", message: "产品型号已被其他产品使用" });
    if (c.model?.trim() && this.modelOwners.has(normalizedModel(c.model)) && this.modelOwners.get(normalizedModel(c.model)) !== id)
      errors.push({ path: "/model", message: "产品型号已被其他产品使用" });
    for (const key of ["problemValues", "features", "scenarios"] as const) {
      const seen = new Set<string>();
      c[key].forEach((v, i) => {
        if (seen.has(v.id) || !v.title.trim() || !v.text.trim())
          errors.push({
            path: `/${key}/${i}`,
            message: "条目需有唯一标识及非空标题、说明",
          });
        seen.add(v.id);
      });
    }
    const materialIds = new Set<string>(),
      versionIds = new Set<string>(),
      mediaIds = new Set<string>();
    for (const [index, m] of c.materials.entries()) {
      const path = "/materials/" + index;
      const allowed = m.category === "promotional"
        ? ["deck", "onepager", "video"]
        : m.category === "technical"
          ? ["whitepaper", "spec", "manual"]
          : [];
      if ((publish || m.category || m.subCategory) &&
          (!m.category || !m.subCategory || !allowed.includes(m.subCategory)))
        errors.push({ path, message: "请选择相互匹配的资料一级和二级分类" });
      if (
        materialIds.has(m.materialId) ||
        versionIds.has(m.versionId) ||
        !m.name.trim() ||
        !m.versionLabel.trim()
      )
        errors.push({
          path,
          message: "资料标识／版本不能重复，名称与版本标签不能为空",
        });
      materialIds.add(m.materialId);
      versionIds.add(m.versionId);
      const versionOwner = this.materialVersionOwners.get(
        id + "/" + m.versionId,
      );
      if (versionOwner && versionOwner !== m.materialId)
        errors.push({ path, message: "资料版本 ID 已属于另一份资料" });
      const history = this.materialHistory.get(id + "/" + m.materialId);
      if (history) {
        const old = history.get(m.versionId);
        if (old && canonical(old) !== canonical(m))
          errors.push({ path, message: "资料内容改变必须生成新版本 ID" });
        if (
          [...history.values()].some(
            (x) =>
              x.versionLabel === m.versionLabel && x.versionId !== m.versionId,
          )
        )
          errors.push({ path, message: "同一资料的版本标签不能复用" });
      }
      try {
        if (m.sourceAssetId) this.assets.asset(id, m.sourceAssetId, "source");
        if (m.preview.kind === "pdf") {
          const a = this.assets.asset(id, m.preview.assetId, "preview");
          requireValue(
            a.mimeType === "application/pdf" &&
              a.pageCount === m.preview.pageCount,
            422,
            "VALIDATION_FAILED",
            "PDF 页数或格式与检查结果不符",
          );
        } else if (m.preview.kind === "video") {
          const a = this.assets.asset(id, m.preview.assetId, "preview");
          requireValue(a.mimeType === m.preview.mimeType && a.mimeType?.startsWith("video/"), 422, "VALIDATION_FAILED", "视频格式与检查结果不符");
        } else {
          const assetIds = new Set<string>();
          m.preview.pages.forEach((page, i) => {
            const a = this.assets.asset(id, page.assetId, "preview");
            requireValue(
              a.mimeType?.startsWith("image/") &&
                page.pageIndex === i + 1 &&
                !assetIds.has(page.assetId),
              422,
              "VALIDATION_FAILED",
              "图片页必须连续、有序且不重复",
            );
            assetIds.add(page.assetId);
          });
        }
      } catch (e) {
        errors.push({
          path,
          message: e instanceof AppError ? e.message : "资料资产不可用",
        });
      }
    }
    for (const [i, media] of c.media.entries())
      try {
        if (mediaIds.has(media.mediaId)) throw new Error("媒体标识重复");
        mediaIds.add(media.mediaId);
        const a = this.assets.asset(id, media.assetId, "media");
        requireValue(
          a.mimeType?.startsWith("image/"),
          422,
          "VALIDATION_FAILED",
          "素材必须是图片",
        );
      } catch (e) {
        errors.push({
          path: "/media/" + i,
          message: e instanceof Error ? e.message : "素材不可用",
        });
      }
    if (c.media.filter((m) => m.role === "cover").length > 1)
      errors.push({ path: "/media", message: "只能设置一张封面" });
    invalidFields(errors);
  }
  save(id: string, body: unknown, requestId: string) {
    this.assertProductWritable(id);
    const b = validateBody<Domain["SaveDraft"]>("SaveDraft", body),
      p = clone(this.product(id));
    const previousModel = p.draft.model;
    requireValue(
      p.draftVersion === b.expectedDraftVersion,
      409,
      "DRAFT_CONFLICT",
      "其他窗口已修改此产品，请核对后再保存",
    );
    this.validateContent(id, b.content);
    const active = p.activeReleaseId ? this.releases.get(p.activeReleaseId) : undefined;
    const revocations = new Set(p.publicMaterialRevocations ?? []);
    for (const m of active?.content.materials ?? []) {
      const revised = b.content.materials.find((item) => item.materialId === m.materialId);
      if (m.category === "promotional" && revised?.category !== "promotional")
        revocations.add(m.materialId);
    }
    p.publicMaterialRevocations = [...revocations];
    p.draft = clone(b.content);
    p.draftVersion++;
    this.commit("SAVE", p, requestId);
    if (previousModel?.trim()) this.modelOwners.set(normalizedModel(previousModel), id);
    if (p.draft.model?.trim()) this.modelOwners.set(normalizedModel(p.draft.model), id);
    for (const m of p.draft.materials) {
      const k = id + "/" + m.materialId,
        history = this.materialHistory.get(k) ?? new Map();
      history.set(m.versionId, clone(m));
      this.materialHistory.set(k, history);
      this.materialVersionOwners.set(id + "/" + m.versionId, m.materialId);
    }
    return this.draft(id);
  }
  preview(id: string, version: number) {
    const d = this.draft(id);
    requireValue(
      d.draftVersion === version,
      409,
      "DRAFT_CONFLICT",
      "草稿版本已变化，请重新打开预览",
    );
    return d;
  }
  materialVersions(id: string): Material[] {
    this.assertProductReadable(id);
    const product = this.product(id);
    const versions = new Map<string, Material>();
    for (const [key, history] of this.materialHistory) {
      if (key.startsWith(id + "/")) for (const material of history.values()) versions.set(material.versionId, clone(material));
    }
    for (const material of product.draft.materials) if (!versions.has(material.versionId)) versions.set(material.versionId, clone(material));
    return [...versions.values()].reverse();
  }
  publish(
    id: string,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    this.assertProductWritable(id);
    return this.once(
      "POST /admin/products/" + id + "/publish",
      key,
      body,
      () => {
        const b = validateBody<Domain["PublishProduct"]>(
            "PublishProduct",
            body,
          ),
          p = clone(this.product(id));
        this.assertProductWritable(id);
        requireValue(
          p.draftVersion === b.expectedDraftVersion,
          409,
          "DRAFT_CONFLICT",
          "草稿已变化，请核对后发布",
        );
        requireValue(
          p.publicationVersion === b.expectedPublicationVersion,
          409,
          "PUBLICATION_CONFLICT",
          "线上状态已变化，请确认后重新操作",
        );
        this.validateContent(id, p.draft, true);
        // Legacy drafts obtain their durable public identity on first publication.
        p.publicId ??= randomUUID();
        const release: Release = {
          id: randomUUID(),
          productId: id,
          sequence: p.releaseSequence + 1,
          content: clone(p.draft),
          publishedAt: new Date().toISOString(),
          publishedBy: this.actor().userId,
        };
        p.activeReleaseId = release.id;
        p.lastReleaseId = release.id;
        p.publicationState = "PUBLISHED";
        p.releaseSequence = release.sequence;
        p.publicationVersion++;
        p.lastPublishedDraftVersion = p.draftVersion;
        p.publicMaterialRevocations = [];
        this.commit("PUBLISH", p, requestId, release);
        return {
          productId: id,
          releaseId: release.id,
          releaseSequence: release.sequence,
          publicationVersion: p.publicationVersion,
          publicationState: "PUBLISHED" as const,
          publishedAt: release.publishedAt,
          publishedBy: release.publishedBy,
        };
      },
    );
  }
  unpublish(
    id: string,
    body: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    this.assertProductWritable(id);
    return this.once(
      "POST /admin/products/" + id + "/unpublish",
      key,
      body,
      () => {
        const b = validateBody<Domain["UnpublishProduct"]>(
            "UnpublishProduct",
            body,
          ),
          p = clone(this.product(id));
        this.assertProductWritable(id);
        requireValue(
          p.publicationVersion === b.expectedPublicationVersion,
          409,
          "PUBLICATION_CONFLICT",
          "线上状态已变化，请确认后重新操作",
        );
        requireValue(
          p.publicationState !== "DRAFT",
          409,
          "INVALID_STATE",
          "从未发布的草稿不能下架",
        );
        if (p.publicationState !== "OFFLINE") {
          p.publicationState = "OFFLINE";
          p.activeReleaseId = null;
          p.publicationVersion++;
          this.commit("UNPUBLISH", p, requestId);
        }
        return {
          productId: id,
          publicationState: "OFFLINE" as const,
          publicationVersion: p.publicationVersion,
          lastReleaseId: p.lastReleaseId ?? null,
          unpublishedAt: this.metadata.get(id)?.unpublishedAt ?? null,
        };
      },
    );
  }
  removeProduct(id: string, body: unknown, key: string | undefined, requestId: string) {
    this.adminOnly();
    return this.once("POST /admin/products/" + id + "/remove", key, body, () => {
      const data = validateBody<Domain["ProductRemoval"]>("ProductRemoval", body), product = clone(this.product(id));
      requireValue(data.reason.trim(), 422, "VALIDATION_FAILED", "请填写移除原因");
      this.assertProductWritable(id);
      requireValue(product.draftVersion === data.expectedDraftVersion, 409, "DRAFT_CONFLICT", "草稿已变化，请刷新后重新确认移除");
      requireValue(product.publicationVersion === data.expectedPublicationVersion, 409, "PUBLICATION_CONFLICT", "发布状态已变化，请刷新后重新确认移除");
      const wasPublished = product.publicationState === "PUBLISHED";
      if (wasPublished) { product.publicationState = "OFFLINE"; product.activeReleaseId = null; product.publicationVersion++; }
      product.deletedAt = new Date().toISOString(); product.deletedBy = this.actor().userId; product.deletionReason = data.reason.trim(); product.draftVersion++;
      this.commit("REMOVE_PRODUCT", product, requestId, undefined, product.deletionReason);
      if (wasPublished) this.metadata.get(id)!.unpublishedAt = product.deletedAt;
      return this.draft(id);
    });
  }
  restoreProduct(id: string, body: unknown, key: string | undefined, requestId: string) {
    this.adminOnly();
    return this.once("POST /admin/products/" + id + "/restore", key, body, () => {
      const data = validateBody<Domain["ProductRemoval"]>("ProductRemoval", body), product = clone(this.product(id));
      requireValue(data.reason.trim(), 422, "VALIDATION_FAILED", "请填写恢复原因");
      requireValue(product.deletedAt, 409, "INVALID_STATE", "产品当前未被移除");
      requireValue(product.draftVersion === data.expectedDraftVersion, 409, "DRAFT_CONFLICT", "草稿已变化，请刷新后重新确认恢复");
      requireValue(product.publicationVersion === data.expectedPublicationVersion, 409, "PUBLICATION_CONFLICT", "发布状态已变化，请刷新后重新确认恢复");
      // Restoration never restores an active publication, including malformed old tombstones.
      if (product.publicationState === "PUBLISHED") { product.publicationState = "OFFLINE"; product.activeReleaseId = null; product.publicationVersion++; }
      product.deletedAt = null; product.deletedBy = null; product.deletionReason = null; product.draftVersion++;
      this.commit("RESTORE_PRODUCT", product, requestId, undefined, data.reason.trim());
      return this.draft(id);
    });
  }
  createUpload(body: unknown, key: string | undefined) {
    this.assertProductWritable(validateBody<Domain["UploadIntent"]>("UploadIntent", body).productId);
    return this.once("POST /admin/uploads", key, body, () => {
      const b = validateBody<Domain["UploadIntent"]>("UploadIntent", body);
      this.assertProductWritable(b.productId);
      return this.assets.create(b);
    });
  }
  current(id: string) {
    const p = this.products.get(id),
      r = p?.activeReleaseId ? this.releases.get(p.activeReleaseId) : undefined;
    requireValue(
      p?.publicationState === "PUBLISHED" && !p.deletedAt && r,
      404,
      "RESOURCE_UNAVAILABLE",
      "此产品或资料暂不可用",
    );
    return r;
  }
  summaries(): Responses["PublicProductSummary"][] {
    const ids = new Map<string, number>();
    for (const p of this.products.values()) if (isPublicProductId(p.publicId)) ids.set(p.publicId.toLowerCase(), (ids.get(p.publicId.toLowerCase()) ?? 0) + 1);
    return [...this.products.values()]
      .filter((p) => !p.deletedAt && p.publicationState === "PUBLISHED" && isPublicProductId(p.publicId) && ids.get(p.publicId.toLowerCase()) === 1)
      .map((p) => {
        const r = this.current(p.productId),
          c = this.categories.find((c) => c.id === r.content.categoryId)!,
          cover = r.content.media.find((m) => m.role === "cover");
        return {
          productId: p.publicId!,
          releaseId: r.id,
          releaseSequence: r.sequence,
          publishedAt: r.publishedAt,
          name: r.content.name,
          categoryId: c.id,
          categoryName: c.name,
          tagline: r.content.tagline,
          coverPath: cover ? this.mediaPath(r, cover.mediaId) : null,
          pilotOrder: p.pilotOrder ?? null,
        };
      })
      .sort(
        (a, b) =>
          b.publishedAt.localeCompare(a.publishedAt) ||
          a.productId.localeCompare(b.productId, undefined, { numeric: true }),
      );
  }
  publicCategories() {
    const rows = this.summaries();
    return this.categories
      .filter((c) => c.enabled)
      .map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName,
        sortOrder: c.sortOrder,
        productCount: rows.filter((r) => r.categoryId === c.id).length,
      }));
  }
  matches(id: string, q: string) {
    const c = this.current(this.resolvePublicId(id)).content;
    return c.name.toLocaleLowerCase().includes(q.toLocaleLowerCase());
  }
  material(r: Release, m: Material): Responses["PublicMaterial"] {
    const publicId = this.product(r.productId).publicId;
    requireValue(publicId, 404, "RESOURCE_UNAVAILABLE", "此产品或资料暂不可用");
    return {
      materialId: m.materialId,
      versionId: m.versionId,
      name: m.name,
      kind: m.kind,
      versionLabel: m.versionLabel,
      applicableVersion: m.applicableVersion ?? null,
      previewKind: m.preview.kind,
      pageCount:
        m.preview.kind === "pdf" ? m.preview.pageCount : m.preview.kind === "video" ? 1 : m.preview.pages.length,
      publishedAt: r.publishedAt,
      previewPath: `/api/v1/catalog/products/${publicId}/materials/${encodeURIComponent(m.materialId)}/preview`,
    };
  }
  mediaPath(r: Release, id: string) {
    const publicId = this.product(r.productId).publicId;
    requireValue(publicId, 404, "RESOURCE_UNAVAILABLE", "此产品或资料暂不可用");
    return `/api/v1/catalog/products/${publicId}/media/${encodeURIComponent(id)}?releaseId=${r.id}`;
  }
  resolvePublicId(id: string) {
    requireValue(isPublicProductId(id), 404, "RESOURCE_UNAVAILABLE", "此产品或资料暂不可用");
    const matches = [...this.products.values()].filter((p) => p.publicId?.toLowerCase() === id.toLowerCase());
    requireValue(matches.length === 1 && !matches[0].deletedAt && matches[0].publicationState === "PUBLISHED", 404, "RESOURCE_UNAVAILABLE", "此产品或资料暂不可用");
    return matches[0].productId;
  }
  private isPublicMaterial(r: Release, material: Material) {
    const draft = this.products.get(r.productId)?.draft.materials.find(
      (m) => m.materialId === material.materialId,
    );
    // Both the published classification and the latest saved classification must
    // explicitly allow public access. Missing legacy data fails closed.
    return material.category === "promotional" && draft?.category === "promotional" &&
      !this.products.get(r.productId)?.publicMaterialRevocations?.includes(material.materialId);
  }
  publicProduct(id: string): Responses["PublicProduct"] {
    const r = this.current(this.resolvePublicId(id)),
      c = r.content,
      category = this.categories.find((x) => x.id === c.categoryId)!;
    return clone({
      productId: id,
      releaseId: r.id,
      releaseSequence: r.sequence,
      publishedAt: r.publishedAt,
      name: c.name,
      ...(c.model?.trim() ? { model: c.model.trim() } : {}),
      category: { id: category.id, name: category.name },
      tagline: c.tagline,
      summary: c.summary,
      audiences: c.audiences ?? "",
      problemValues: c.problemValues,
      features: c.features,
      scenarios: c.scenarios,
      technical: Object.fromEntries(
        Object.entries(c.technical).filter(([, v]) => v.trim()),
      ),
      media: c.media.map((m) => ({
        mediaId: m.mediaId,
        role: m.role,
        alt: m.alt,
        path: this.mediaPath(r, m.mediaId),
      })),
      materials: c.materials.filter((m) => this.isPublicMaterial(r, m)).map((m) => this.material(r, m)),
    });
  }
  currentMaterials(): Responses["CatalogMaterialRow"][] {
    return this.summaries().flatMap((s) => {
      const r = this.current(this.resolvePublicId(s.productId));
      return r.content.materials.filter((m) => this.isPublicMaterial(r, m)).map((m) => ({
        productId: s.productId,
        productName: s.name,
        categoryId: s.categoryId,
        material: this.material(r, m),
      }));
    });
  }
  manifest(id: string, materialId: string): Responses["PreviewManifest"] {
    const r = this.current(this.resolvePublicId(id)),
      m = r.content.materials.find((m) => m.materialId === materialId);
    requireValue(m && this.isPublicMaterial(r, m), 404, "RESOURCE_UNAVAILABLE", "资料暂不可用");
    const base = `/api/v1/catalog/products/${id}/materials/${encodeURIComponent(materialId)}/preview/content?releaseId=${r.id}&versionId=${encodeURIComponent(m.versionId)}&part=`;
    return {
      productId: id,
      materialId,
      releaseId: r.id,
      versionId: m.versionId,
      name: m.name,
      versionLabel: m.versionLabel,
      previewKind: m.preview.kind,
      pageCount:
        m.preview.kind === "pdf" ? m.preview.pageCount : m.preview.kind === "video" ? 1 : m.preview.pages.length,
      parts:
        m.preview.kind === "pdf"
          ? [
              {
                part: "pdf",
                pageIndex: null,
                mimeType: "application/pdf",
                path: base + "pdf",
              },
            ]
          : m.preview.kind === "video" ? [{ part: "video", pageIndex: null, mimeType: m.preview.mimeType, path: base + "video" }] : m.preview.pages.map((p) => ({
              part: "page-" + p.pageIndex,
              pageIndex: p.pageIndex,
              mimeType: "image/png",
              path: base + "page-" + p.pageIndex,
            })),
    };
  }
  previewAsset(
    id: string,
    materialId: string,
    releaseId: string,
    versionId: string,
    part: string,
  ) {
    const r = this.current(this.resolvePublicId(id)),
      m = r.content.materials.find((m) => m.materialId === materialId);
    requireValue(m && this.isPublicMaterial(r, m), 404, "RESOURCE_UNAVAILABLE", "资料暂不可用");
    requireValue(
      r.id === releaseId && m.versionId === versionId,
      409,
      "VERSION_CHANGED",
      "资料已更新，请打开当前版本",
    );
    const assetId =
      m.preview.kind === "pdf"
        ? part === "pdf"
          ? m.preview.assetId
          : undefined
        : m.preview.kind === "video" ? (part === "video" ? m.preview.assetId : undefined) : m.preview.pages.find((p) => "page-" + p.pageIndex === part)?.assetId;
    requireValue(assetId, 404, "RESOURCE_UNAVAILABLE", "预览页不存在");
    return assetId;
  }
  mediaAsset(id: string, mediaId: string, releaseId: string) {
    const r = this.current(this.resolvePublicId(id));
    requireValue(r.id === releaseId, 409, "VERSION_CHANGED", "产品资料已更新");
    const m = r.content.media.find((m) => m.mediaId === mediaId);
    requireValue(m, 404, "RESOURCE_UNAVAILABLE", "素材暂不可用");
    return m.assetId;
  }
  private salesMaterial(id: string, materialId: string) {
    const r = this.current(this.resolvePublicId(id));
    const m = r.content.materials.find((item) => item.materialId === materialId);
    requireValue(m, 404, "RESOURCE_UNAVAILABLE", "资料暂不可用");
    return { r, m };
  }
  salesMatches(id: string, q: string) {
    const content = this.current(this.resolvePublicId(id)).content;
    const term = q.toLocaleLowerCase();
    return [content.name, ...(content.aliases ?? [])].some((value) => value.toLocaleLowerCase().includes(term));
  }
  salesProduct(id: string): Responses["PublicProduct"] {
    const result = this.publicProduct(id);
    const r = this.current(this.resolvePublicId(id));
    result.materials = r.content.materials
      .map((m) => ({ ...this.material(r, m), previewPath: `/api/v1/sales/catalog/products/${id}/materials/${encodeURIComponent(m.materialId)}/preview` }));
    return result;
  }
  currentSalesMaterials(): Responses["CatalogMaterialRow"][] {
    return this.summaries().flatMap((summary) => {
      const release = this.current(this.resolvePublicId(summary.productId));
      return release.content.materials.map((material) => ({
        productId: summary.productId, productName: summary.name, categoryId: summary.categoryId,
        material: { ...this.material(release, material), previewPath: `/api/v1/sales/catalog/products/${summary.productId}/materials/${encodeURIComponent(material.materialId)}/preview` },
      }));
    });
  }
  salesManifest(id: string, materialId: string): Responses["PreviewManifest"] {
    const { r, m } = this.salesMaterial(id, materialId);
    const base = `/api/v1/sales/catalog/products/${id}/materials/${encodeURIComponent(materialId)}/preview/content?releaseId=${encodeURIComponent(r.id)}&versionId=${encodeURIComponent(m.versionId)}&part=`;
    return { productId: id, materialId, releaseId: r.id, versionId: m.versionId,
      name: m.name, versionLabel: m.versionLabel, previewKind: m.preview.kind,
      pageCount: m.preview.kind === "pdf" ? m.preview.pageCount : m.preview.kind === "video" ? 1 : m.preview.pages.length,
      parts: m.preview.kind === "pdf" ? [{ part: "pdf", pageIndex: null, mimeType: "application/pdf", path: base + "pdf" }]
        : m.preview.kind === "video" ? [{ part: "video", pageIndex: null, mimeType: m.preview.mimeType, path: base + "video" }] : m.preview.pages.map((p) => ({ part: "page-" + p.pageIndex, pageIndex: p.pageIndex, mimeType: "image/png", path: base + "page-" + p.pageIndex })) };
  }
  salesPreviewAsset(id: string, materialId: string, releaseId: string, versionId: string, part: string) {
    const { r, m } = this.salesMaterial(id, materialId);
    requireValue(r.id === releaseId && m.versionId === versionId, 409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
    const assetId = m.preview.kind === "pdf" ? (part === "pdf" ? m.preview.assetId : undefined)
      : m.preview.kind === "video" ? (part === "video" ? m.preview.assetId : undefined) : m.preview.pages.find((p) => "page-" + p.pageIndex === part)?.assetId;
    requireValue(assetId, 404, "RESOURCE_UNAVAILABLE", "预览页不存在");
    return assetId;
  }
  salesSourceAsset(id: string, materialId: string, releaseId: string, versionId: string) {
    const { r, m } = this.salesMaterial(id, materialId);
    requireValue(r.id === releaseId && m.versionId === versionId, 409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
    if (m.sourceAssetId) return { assetId: m.sourceAssetId, name: m.name, purpose: "source" as const };
    if (m.preview.kind === "images") return { assetId: undefined, assetIds: m.preview.pages.map(p => p.assetId), name: m.name, purpose: "preview" as const };
    return { assetId: m.preview.assetId, name: m.name, purpose: "preview" as const };
  }
}
