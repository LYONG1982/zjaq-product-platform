import { randomUUID } from "node:crypto";
import categories from "../../data/categories.seed.json";
import { seedProducts } from "../../services/domain/src/seed-products";
import { subjectKey } from "../../services/api/src/auth";
import { requireValue } from "../../services/domain/src/errors";
import type { Repository } from "../../services/api/src/repository";

/**
 * 测试专用初始化：写入 27 款草稿主档、分类与管理员主体。
 * 生产初始化不再导入示例产品（见 services/api/src/initialize.ts）。
 */
export async function bootstrapTestRepo(repo: Repository, subject: string) {
  requireValue(subject.trim(), 400, "INVALID_ARGUMENT", "需要管理员主体");
  await repo.transaction(async (tx) => {
    const references: Record<string, { count: number; templates: Record<string, number> }> = {};
    for (const product of seedProducts) {
      const { draft, ...master } = product;
      await tx.set("products", product.productId, master);
      await tx.set("drafts", product.productId, { content: draft });
      const ref = references[draft.categoryId] ?? { count: 0, templates: {} };
      ref.count++;
      ref.templates[draft.templateId] = (ref.templates[draft.templateId] ?? 0) + 1;
      references[draft.categoryId] = ref;
    }
    const userId = randomUUID();
    await tx.set("users", userId, {
      userId,
      subjectId: subject.trim(),
      displayName: "测试管理员",
      role: "ADMIN",
      enabled: true,
      version: 1,
    });
    await tx.set("subjects", subjectKey(subject.trim()), { userId });
    for (const category of categories)
      await tx.set("categories", category.id, { ...category, version: 1 });
    await tx.set("control", "catalog", {
      categories: categories.map((category) => ({ ...category, version: 1 })),
      references,
    });
    await tx.set("control", "admins", { enabledAdmins: 1 });
    await tx.set("control", "counter", { next: 28 });
    await tx.set("control", "state", { ready: true, maintenance: false, revision: 1 });
  });
  return seedProducts;
}
