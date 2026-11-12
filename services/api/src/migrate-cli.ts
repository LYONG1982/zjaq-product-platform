import { fileURLToPath } from "node:url";
import { migrate, mysqlConfig, createMysqlPool } from "./mysql-repository";

const pool = createMysqlPool(mysqlConfig());
try {
  await migrate(pool, fileURLToPath(new URL("../migrations/", import.meta.url)));
  console.log(JSON.stringify({ event: "migrations_done" }));
} finally {
  await pool.end();
}
