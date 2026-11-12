import { randomUUID } from "node:crypto";
import categories from "../../../data/categories.seed.json";
import type { Repository } from "./repository";
import { requireValue } from "../../domain/src/errors";
import { subjectKey } from "./auth";
import type { MysqlAuthStore } from "./mysql-auth";

export type BootstrapInput = { username: string; password: string };

/** 仅由显式运维命令调用：初始化分类、控制记录与首个管理员账号，不导入任何示例产品。 */
export async function initialize(
  repo: Repository,
  auth: MysqlAuthStore,
  input: BootstrapInput,
) {
  const username = input.username.trim();
  requireValue(username.length >= 3 && username.length <= 64, 400, "INVALID_ARGUMENT", "管理员账号长度需为 3 到 64 位");
  requireValue(
    !(await repo.list("products")).length && !(await repo.list("users")).length,
    409,
    "NON_EMPTY_TARGET",
    "仅可初始化空目标",
  );
  const userId = randomUUID();
  const subjectId = `mysql:${userId}`;
  await repo.transaction(async (tx) => {
    requireValue(
      !(await tx.get("control", "state")),
      409,
      "ALREADY_INITIALIZED",
      "目标已有状态，拒绝覆盖初始化",
    );
    await tx.set("users", userId, {
      userId,
      subjectId,
      displayName: username,
      role: "ADMIN",
      enabled: true,
      version: 1,
    });
    await tx.set("subjects", subjectKey(subjectId), { userId });
    for (const c of categories)
      await tx.set("categories", c.id, { ...c, version: 1 });
    await tx.set("control", "catalog", {
      categories: categories.map((c) => ({ ...c, version: 1 })),
      references: {},
    });
    await tx.set("control", "admins", { enabledAdmins: 1 });
    await tx.set("control", "counter", { next: 1 });
    await tx.set("control", "state", {
      ready: true,
      maintenance: false,
      revision: 1,
    });
  });
  await auth.createUser(userId, username, input.password);
  return { userId, username, role: "ADMIN" };
}
