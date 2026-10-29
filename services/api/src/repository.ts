import cloudbase from "@cloudbase/node-sdk";
import { requireValue } from "../../domain/src/errors";
export type Document = Record<string, unknown>;
export interface Transaction {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  set(collection: string, id: string, value: unknown): Promise<void>;
}
export interface Repository extends Transaction {
  list<T>(collection: string): Promise<T[]>;
  pruneExpired?(collection: string, before: Date): Promise<void>;
  scan?<T>(collection: string): AsyncIterable<T>;
  entries?<T>(collection: string): AsyncIterable<{ id: string; value: T }>;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}
export const collections = [
  "control",
  "products",
  "drafts",
  "releases",
  "history",
  "assets",
  "uploads",
  "idempotency",
  "categories",
  "users",
  "subjects",
  "audit",
  "feedback",
  "analytics",
  "rates",
] as const;
function clean<T>(value: T): T {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { _id, ...data } = value as Record<string, unknown>;
    return data as T;
  }
  return value;
}
export class CloudBaseRepository implements Repository {
  readonly app;
  readonly db;
  constructor(
    envId: string,
    readonly prefix = "zj_",
  ) {
    requireValue(
      /^[a-z][a-z0-9_]{0,24}$/.test(prefix),
      500,
      "CONFIGURATION_ERROR",
      "集合前缀无效",
    );
    this.app = cloudbase.init({ env: envId, timeout: 15000 });
    this.db = this.app.database();
  }
  private collection(name: string) {
    requireValue(
      (collections as readonly string[]).includes(name),
      500,
      "CONFIGURATION_ERROR",
      "集合名称无效",
    );
    return this.prefix + name;
  }
  private adapter(client: {
    collection(name: string): {
      doc(id: string): {
        get(): Promise<{ data: unknown[] }>;
        set(data: object): Promise<unknown>;
      };
    };
  }): Transaction {
    return {
      get: async <T>(name: string, id: string) => {
        const r = await client.collection(this.collection(name)).doc(id).get();
        return r.data?.length ? (clean(r.data[0]) as T) : undefined;
      },
      set: async (name, id, value) => {
        requireValue(
          Buffer.byteLength(JSON.stringify(value)) < 750000,
          413,
          "DOCUMENT_TOO_LARGE",
          "内容或历史记录超过单文档容量，请联系维护人员",
        );
        await client
          .collection(this.collection(name))
          .doc(id)
          .set(value as object);
      },
    };
  }
  get<T>(name: string, id: string) {
    return this.adapter(this.db as never).get<T>(name, id);
  }
  set(name: string, id: string, value: unknown) {
    return this.adapter(this.db as never).set(name, id, value);
  }
  async list<T>(name: string) {
    const rows: T[] = [];
    for (let skip = 0; skip < 10000; skip += 100) {
      const r = await this.db
        .collection(this.collection(name))
        .orderBy("_id", "asc")
        .skip(skip)
        .limit(100)
        .get();
      rows.push(...r.data.map((v) => clean(v) as T));
      if (r.data.length < 100) return rows;
    }
    throw new Error(
      "COLLECTION_LIMIT: export or query requires a paged production adapter above 10000 records",
    );
  }
  async *scan<T>(name: string): AsyncIterable<T> {
    let cursor = "";
    for (;;) {
      const query = this.db.collection(this.collection(name));
      const rows = await (cursor ? query.where({ _id: this.db.command.gt(cursor) }) : query).orderBy("_id", "asc").limit(100).get();
      for (const row of rows.data) yield clean(row) as T;
      if (rows.data.length < 100) return;
      cursor = String(rows.data[rows.data.length - 1]._id);
    }
  }
  async *entries<T>(name: string): AsyncIterable<{ id: string; value: T }> {
    let cursor = "";
    for (;;) {
      const query = this.db.collection(this.collection(name));
      const rows = await (cursor ? query.where({ _id: this.db.command.gt(cursor) }) : query).orderBy("_id", "asc").limit(100).get();
      for (const row of rows.data) yield { id: String(row._id), value: clean(row) as T };
      if (rows.data.length < 100) return;
      cursor = String(rows.data[rows.data.length - 1]._id);
    }
  }
  async pruneExpired(name: string, before: Date) {
    requireValue(name === "analytics" || name === "rates", 500, "CONFIGURATION_ERROR", "此集合不支持到期清理");
    // Bounded batches prevent loading raw IP history into process memory.
    for (;;) {
      const rows = await this.db.collection(this.collection(name)).where({ expiresAt: this.db.command.lte(before) }).limit(100).get();
      if (!rows.data.length) return;
      for (const row of rows.data) await this.db.collection(this.collection(name)).doc(String(row._id)).remove();
    }
  }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    let result!: T;
    await this.db.runTransaction(async (tx: unknown) => {
      result = await fn(this.adapter(tx as never));
    });
    return result;
  }
}
