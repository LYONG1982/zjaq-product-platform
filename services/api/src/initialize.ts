import { randomUUID } from "node:crypto";
import { applyDevelopmentSeed } from "../../mock-api/src/seed";
import categories from "../../../data/categories.seed.json";
import type { Repository } from "./repository";
import { requireValue } from "../../domain/src/errors";
import { subjectKey } from "./auth";
/** Called only by the explicit operator command; never on API startup. */
export async function initialize(repo: Repository, subjectId: string) {
  requireValue(
    subjectId.trim(),
    400,
    "INVALID_ARGUMENT",
    "需要首个管理员身份主体",
  );
  requireValue(
    !(await repo.list("products")).length && !(await repo.list("users")).length,
    409,
    "NON_EMPTY_TARGET",
    "仅可初始化空目标",
  );
  const seed = applyDevelopmentSeed([]);
  const references: Record<
    string,
    { count: number; templates: Record<string, number> }
  > = {};
  for (const p of seed.products) {
    const r = references[p.draft.categoryId] ?? { count: 0, templates: {} };
    r.count++;
    r.templates[p.draft.templateId] =
      (r.templates[p.draft.templateId] ?? 0) + 1;
    references[p.draft.categoryId] = r;
  }
  await repo.transaction(async (tx) => {
    requireValue(
      !(await tx.get("control", "state")),
      409,
      "ALREADY_INITIALIZED",
      "目标已有状态，拒绝覆盖初始化",
    );
    for (const product of seed.products) {
      requireValue(
        !(await tx.get("products", product.productId)),
        409,
        "PRODUCT_EXISTS",
        "产品主档已存在",
      );
      const { draft, ...master } = product;
      await tx.set("products", product.productId, master);
      await tx.set("drafts", product.productId, { content: draft });
    }
    const userId = randomUUID();
    const user = {
      userId,
      subjectId: subjectId.trim(),
      displayName: "初始管理员",
      role: "ADMIN",
      enabled: true,
      version: 1,
    };
    await tx.set("users", userId, user);
    await tx.set("subjects", subjectKey(user.subjectId), { userId });
    for (const c of categories)
      await tx.set("categories", c.id, { ...c, version: 1 });
    await tx.set("control", "catalog", {
      categories: categories.map((c) => ({ ...c, version: 1 })),
      references,
    });
    await tx.set("control", "admins", { enabledAdmins: 1 });
    await tx.set("control", "counter", { next: seed.counterNext });
    await tx.set("control", "state", {
      ready: true,
      maintenance: false,
      revision: 1,
    });
  });
  return {
    products: seed.products.length,
    state: "DRAFT",
    counterNext: seed.counterNext,
  };
}

export async function seedOriginals(repo: Repository) {
  const seed = applyDevelopmentSeed([]);
  let inserted = 0,
    skipped = 0;
  for (const product of seed.products) {
    const created = await repo.transaction(async (tx) => {
      const state = await tx.get<{
        ready: boolean;
        maintenance?: boolean;
        revision: number;
      }>("control", "state");
      requireValue(
        state?.ready && !state.maintenance,
        503,
        "NOT_INITIALIZED",
        "环境未就绪",
      );
      const counter = await tx.get<{ next: number }>("control", "counter");
      requireValue(counter, 503, "NOT_INITIALIZED", "计数器未就绪");
      if (await tx.get("products", product.productId)) {
        return false;
      }
      requireValue(
        !(await tx.get("drafts", product.productId)),
        409,
        "ORPHAN_DRAFT",
        "发现孤立草稿，需人工核对",
      );
      const catalog = await tx.get<{
        categories: {
          id: string;
          enabled: boolean;
          allowedTemplateIds: string[];
        }[];
        references: Record<
          string,
          { count: number; templates: Record<string, number> }
        >;
      }>("control", "catalog");
      const category = catalog?.categories.find(
        (c) => c.id === product.draft.categoryId,
      );
      requireValue(
        catalog &&
          category?.enabled &&
          category.allowedTemplateIds.includes(product.draft.templateId),
        409,
        "CATEGORY_INCOMPATIBLE",
        "原主档分类或模板映射已变化，需人工核对",
      );
      const { draft, ...master } = product;
      const refs = catalog.references[draft.categoryId] ?? {
        count: 0,
        templates: {},
      };
      refs.count++;
      refs.templates[draft.templateId] =
        (refs.templates[draft.templateId] ?? 0) + 1;
      catalog.references[draft.categoryId] = refs;
      await tx.set("products", product.productId, master);
      await tx.set("drafts", product.productId, { content: draft });
      await tx.set("control", "catalog", catalog);
      await tx.set("control", "counter", {
        next: Math.max(counter.next, Number(product.productId.slice(3)) + 1),
      });
      await tx.set("control", "state", {
        ...state,
        revision: state.revision + 1,
      });
      return true;
    });
    if (created) inserted++;
    else skipped++;
  }
  return { inserted, skipped, states: "DRAFT", existingRecordsPreserved: true };
}
