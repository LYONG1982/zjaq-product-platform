export type Document = Record<string, unknown>;
export interface Transaction {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  set(collection: string, id: string, value: unknown): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
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
