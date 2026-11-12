import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createMysqlPool, migrate, mysqlConfig, MysqlRepository } from "./mysql-repository";
import { MysqlAuthStore, hashPassword } from "./mysql-auth";
import { subjectKey } from "./auth";
import { requireValue } from "../../domain/src/errors";

const usage =
  "用法：node --import tsx services/api/src/user-cli.ts --username <账号> --password <至少 8 位> [--role ADMIN|CONTENT_MANAGER|SALES] [--name <显示名>]";
function readArguments(args: string[]) {
  const values = new Map<string, string>(), allowed = ["--username", "--password", "--role", "--name"];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!allowed.includes(flag) || values.has(flag) || !value || value.startsWith("--")) throw new Error(usage);
    values.set(flag, value);
  }
  const username = values.get("--username")?.trim(), password = values.get("--password");
  if (!username || !password) throw new Error(usage);
  const role = values.get("--role") ?? "SALES";
  if (!["ADMIN", "CONTENT_MANAGER", "SALES"].includes(role)) throw new Error("角色仅支持 ADMIN、CONTENT_MANAGER、SALES");
  return { username, password, role: role as "ADMIN" | "CONTENT_MANAGER" | "SALES", displayName: values.get("--name")?.trim() || username };
}

const input = readArguments(process.argv.slice(2));
await hashPassword(input.password); // 复用同一套长度与散列校验，失败时不写任何记录。
const pool = createMysqlPool(mysqlConfig());
await migrate(pool, fileURLToPath(new URL("../migrations/", import.meta.url)));
const repo = new MysqlRepository(pool);
const auth = new MysqlAuthStore(pool);
try {
  const existing = await auth.userIdFor(input.username);
  {
    if (existing) {
      await auth.updatePassword(existing, input.password);
      await repo.transaction(async (tx) => {
        const current = await tx.get<Record<string, unknown> & { version?: number }>("users", existing);
        requireValue(current, 404, "RESOURCE_UNAVAILABLE", "账号记录已不存在");
        await tx.set("users", existing, {
          ...current,
          role: input.role,
          displayName: input.displayName,
          enabled: true,
          version: (current.version ?? 1) + 1,
        });
      });
      console.log(JSON.stringify({ event: "user_updated", userId: existing, username: input.username, role: input.role }));
    } else {
      const userId = randomUUID(), subjectId = `mysql:${userId}`;
      await repo.transaction(async (tx) => {
        requireValue(!(await tx.get("subjects", subjectKey(subjectId))), 409, "ALREADY_EXISTS", "身份索引已存在");
        await tx.set("users", userId, {
          userId,
          subjectId,
          displayName: input.displayName,
          role: input.role,
          enabled: true,
          version: 1,
        });
        await tx.set("subjects", subjectKey(subjectId), { userId });
        if (input.role === "ADMIN") {
          const admins = await tx.get<{ enabledAdmins: number }>("control", "admins");
          if (admins) await tx.set("control", "admins", { enabledAdmins: admins.enabledAdmins + 1 });
        }
      });
      await auth.createUser(userId, input.username, input.password);
      console.log(JSON.stringify({ event: "user_created", userId, username: input.username, role: input.role }));
    }
  }
} finally {
  await repo.close();
}
