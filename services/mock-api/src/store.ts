import { DomainEngine } from "../../domain/src/engine";
import { identity } from "../../domain/src/identity";
import { AssetStore } from "./assets";
import { applyDevelopmentSeed } from "./seed";
import categories from "../../../data/categories.seed.json";
export { identity };
export class MockStore extends DomainEngine {
  declare readonly assets: AssetStore;
  constructor(beforeCommit?: (action: string) => void) {
    super(new AssetStore(), beforeCommit, true);
    const seed = applyDevelopmentSeed([]);
    this.counter = seed.counterNext;
    seed.products.forEach((p) => this.products.set(p.productId, p));
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
  }
}
