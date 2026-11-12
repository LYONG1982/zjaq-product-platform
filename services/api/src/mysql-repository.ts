import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createPool, type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";

const DOCUMENT_LIMIT = 750_000;

export type MysqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function mysqlConfig(env: NodeJS.ProcessEnv = process.env): MysqlConfig {
  const config = {
    host: env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(env.MYSQL_PORT ?? 3306),
    user: env.MYSQL_USER ?? "",
    password: env.MYSQL_PASSWORD ?? "",
    database: env.MYSQL_DATABASE ?? "",
  };
  if (!config.user) throw new Error("MISSING_CONFIGURATION: MYSQL_USER");
  if (!config.database) throw new Error("MISSING_CONFIGURATION: MYSQL_DATABASE");
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)
    throw new Error("INVALID_PORT: MYSQL_PORT");
  return config;
}

export function createMysqlPool(config: MysqlConfig): Pool {
  return createPool({
    ...config,
    charset: "utf8mb4",
    timezone: "Z",
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true,
    multipleStatements: false,
  });
}

/** 迁移按文件名顺序执行，已执行的记录在 schema_migrations。 */
export async function migrate(pool: Pool, directory: string) {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(128) CHARACTER SET ascii PRIMARY KEY, applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB",
  );
  const [applied] = await pool.query<RowDataPacket[]>("SELECT name FROM schema_migrations");
  const done = new Set(applied.map((row) => String(row.name)));
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    const sql = await readFile(join(directory, name), "utf8");
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean))
      await pool.query(statement);
    await pool.query("INSERT INTO schema_migrations (name) VALUES (?)", [name]);
    console.log(JSON.stringify({ event: "migration_applied", name }));
  }
}

const unstable = new Set([1213, 1205]);

export class MysqlRepository {
  constructor(readonly pool: Pool) {}

  private adapter(client: Pool | PoolConnection): import("./repository").Transaction {
    return {
      get: async <T>(collection: string, id: string) => {
        const [rows] = await client.query<RowDataPacket[]>(
          "SELECT payload FROM documents WHERE collection = ? AND doc_id = ? FOR UPDATE",
          [collection, id],
        );
        return rows.length ? (JSON.parse(rows[0].payload) as T) : undefined;
      },
      set: async (collection: string, id: string, value: unknown) => {
        requireDocumentName(collection);
        if (!id || Buffer.byteLength(id) > 128) throw new Error("INVALID_DOCUMENT_ID");
        const payload = JSON.stringify(value);
        if (Buffer.byteLength(payload) >= DOCUMENT_LIMIT) {
          const error = new Error("内容或历史记录超过单文档容量，请联系维护人员") as Error & { status?: number; code?: string };
          error.status = 413;
          error.code = "DOCUMENT_TOO_LARGE";
          throw error;
        }
        const expires = typeof value === "object" && value && "expiresAt" in value ? (value as { expiresAt?: unknown }).expiresAt : undefined;
        const expiresAt = expires ? Date.parse(String(expires)) : null;
        await client.query(
          "INSERT INTO documents (collection, doc_id, payload, expires_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at)",
          [collection, id, payload, Number.isFinite(expiresAt) ? expiresAt : null],
        );
      },
      delete: async (collection: string, id: string) => {
        requireDocumentName(collection);
        await client.query(
          "DELETE FROM documents WHERE collection = ? AND doc_id = ?",
          [collection, id],
        );
      },
    };
  }

  get = <T>(collection: string, id: string) => this.adapter(this.pool).get<T>(collection, id);
  set = (collection: string, id: string, value: unknown) => this.adapter(this.pool).set(collection, id, value);
  delete = (collection: string, id: string) => this.adapter(this.pool).delete(collection, id);

  async list<T>(collection: string, limit = 10000): Promise<T[]> {
    const rows: T[] = [];
    for await (const value of this.scan<T>(collection, limit)) rows.push(value);
    return rows;
  }

  async *scan<T>(collection: string, limit = 10000): AsyncIterable<T> {
    for await (const row of this.entries<T>(collection, limit)) yield row.value;
  }

  async *entries<T>(collection: string, limit = 10000): AsyncIterable<{ id: string; value: T }> {
    let cursor = "";
    let total = 0;
    for (;;) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        "SELECT doc_id, payload FROM documents WHERE collection = ? AND doc_id > ? ORDER BY doc_id ASC LIMIT 100",
        [collection, cursor],
      );
      for (const row of rows) {
        total++;
        if (total > limit) throw new Error("COLLECTION_LIMIT: export or query requires a paged production adapter above 10000 records");
        yield { id: String(row.doc_id), value: JSON.parse(row.payload) as T };
      }
      if (rows.length < 100) return;
      cursor = String(rows[rows.length - 1].doc_id);
    }
  }

  async pruneExpired(collection: string, before: Date) {
    if (collection !== "analytics" && collection !== "rates")
      throw new Error("此集合不支持到期清理");
    const limit = before.getTime();
    for (;;) {
      const [result] = await this.pool.query<import("mysql2").ResultSetHeader>(
        "DELETE FROM documents WHERE collection = ? AND expires_at IS NOT NULL AND expires_at <= ? LIMIT 1000",
        [collection, limit],
      );
      if (result.affectedRows < 1000) return;
    }
  }

  async transaction<T>(fn: (tx: import("./repository").Transaction) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const connection = await this.pool.getConnection();
      try {
        await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
        await connection.beginTransaction();
        const result = await fn(this.adapter(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        const code = (error as { errno?: number }).errno;
        if (!code || !unstable.has(code) || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 30));
      } finally {
        connection.release();
      }
    }
    throw new Error("UNREACHABLE");
  }

  async close() {
    await this.pool.end();
  }
}

function requireDocumentName(collection: string) {
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(collection))
    throw new Error("INVALID_COLLECTION");
}

export const documentHash = (value: string) => createHash("sha256").update(value).digest("hex");
