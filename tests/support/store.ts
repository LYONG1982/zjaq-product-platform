import { DomainEngine } from "../../services/domain/src/engine";
import { identity, salesIdentity } from "../../services/domain/src/identity";
import { AssetStore } from "../../services/domain/src/asset-store";
import { applyDevelopmentSeed } from "../../services/domain/src/seed-products";
import categories from "../../data/categories.seed.json";
export { identity };
/** 纯内存引擎替身：只用于单元测试与本地快速验证，不参与生产启动。 */
export class TestStore extends DomainEngine {
  declare readonly assets: AssetStore;
  constructor(
    beforeCommit?: (action: string) => void,
    includeTestRoles = false,
    seed = process.env.TEST_SKIP_SEED !== "true",
  ) {
    super(new AssetStore(), beforeCommit, true);
    const plan = applyDevelopmentSeed([], 1, seed ? undefined : []);
    this.counter = plan.counterNext;
    plan.products.forEach((p) => this.products.set(p.productId, p));
    categories.forEach((c) =>
      this.categoryRecords.set(c.id, { ...structuredClone(c), version: 1 }),
    );
    this.users.set(identity.userId, { ...identity, version: 1 });
    this.users.set("mock-admin", {
      userId: "mock-admin",
      subjectId: "local-admin-only",
      displayName: "本地模拟管理员",
      role: "ADMIN",
      enabled: true,
      version: 1,
    });
    if (includeTestRoles)
      this.users.set(salesIdentity.userId, { ...salesIdentity, version: 1 });
  }
}
