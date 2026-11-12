import { fileURLToPath } from "node:url";
import { createMysqlPool, migrate, mysqlConfig, MysqlRepository } from "./mysql-repository";
import { MysqlAuthStore } from "./mysql-auth";
import { initialize } from "./initialize";

const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD ?? "";
if (!username || !password) {
  console.error("需要设置 ADMIN_USERNAME 与 ADMIN_PASSWORD");
  process.exit(1);
}
const pool = createMysqlPool(mysqlConfig());
try {
  await migrate(pool, fileURLToPath(new URL("../migrations/", import.meta.url)));
  const repo = new MysqlRepository(pool);
  const result = await initialize(repo, new MysqlAuthStore(pool), { username, password });
  console.log(JSON.stringify({ event: "initialized", ...result }));
} finally {
  await pool.end();
}
