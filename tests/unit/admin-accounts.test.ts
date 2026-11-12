import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { actorContext } from "../../services/domain/src/identity";
import { DomainBackend, type LocalAccounts } from "../../services/api/src/domain-backend";
import { bootstrapTestRepo } from "../support/bootstrap";
import { type Repository, type Transaction } from "../../services/api/src/repository";
import { subjectKey } from "../../services/api/src/auth";

class Harness implements Repository {
  data = new Map<string, any>(); fail = false;
  async get<T>(c: string, id: string) { return structuredClone(this.data.get(c + "/" + id)) as T | undefined; }
  async set(c: string, id: string, value: unknown) { this.data.set(c + "/" + id, structuredClone(value)); }
  async delete(c: string, id: string) { this.data.delete(c + "/" + id); }
  async list<T>(c: string) { return [...this.data].filter(([k]) => k.startsWith(c + "/")).map(([,v]) => structuredClone(v) as T); }
  async *entries<T>(c: string) { for (const [k, v] of this.data) if (k.startsWith(c + "/")) yield { id: k.slice(c.length + 1), value: structuredClone(v) as T }; }
  async transaction<T>(fn: (tx: Transaction) => Promise<T>) { const before = structuredClone(this.data); try { const value = await fn(this); if (this.fail) throw new Error("INJECTED_FAILURE"); return value; } catch (error) { this.data = before; throw error; } }
}

class FakeAccounts implements LocalAccounts {
  readonly rows = new Map<string, { userId: string; password: string }>();
  readonly kicked: string[] = [];
  async userIdFor(username: string) { return this.rows.get(username)?.userId; }
  async usernameOf(userId: string) { for (const [name, row] of this.rows) if (row.userId === userId) return name; return undefined; }
  async createUser(userId: string, username: string, password: string) { this.rows.set(username, { userId, password }); }
  async updatePassword(userId: string, password: string) { for (const row of this.rows.values()) if (row.userId === userId) row.password = password; }
  async deleteSessionsOf(userId: string) { this.kicked.push(userId); }
  async deleteUser(userId: string) { for (const [name, row] of this.rows) if (row.userId === userId) this.rows.delete(name); }
}

const body = (username: string, extra: Record<string, unknown> = {}) => ({
  username,
  password: "Password123",
  displayName: "后台编辑",
  role: "CONTENT_MANAGER" as const,
  enabled: true,
  ...extra,
});

test("backend accounts create real logins, reset passwords and revoke sessions", async () => {
  const repo = new Harness(); await bootstrapTestRepo(repo, "test-admin");
  const accounts = new FakeAccounts();
  const backend = new DomainBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { throw new Error("unused"); }, async download() { throw new Error("unused"); } }, accounts);
  await actorContext.run(await backend.authenticate("test"), async () => {
    const created = await backend.writeUser(undefined, body("editor1"), "create");
    assert.equal(created.username, "editor1");
    assert.equal(accounts.rows.get("editor1")?.userId, created.userId);
    assert.equal(accounts.rows.get("editor1")?.password, "Password123");
    const stored = await repo.get<any>("users", created.userId);
    assert.equal(stored.username, "editor1");
    assert.equal(stored.subjectId, "mysql:" + created.userId);
    assert.ok(await repo.get("subjects", subjectKey(created.subjectId)));
    await assert.rejects(backend.writeUser(undefined, body("editor1"), "duplicate"), { status: 409, code: "DUPLICATE_USERNAME" });
    await assert.rejects(backend.writeUser(undefined, { ...body("editor2"), password: undefined }, "no-password"), { status: 422 });
    await assert.rejects(
      backend.writeUser(created.userId, { ...body("editor2"), expectedVersion: created.version }, "rename"),
      { status: 422 },
    );
    const reset = await backend.writeUser(created.userId, { ...body("editor1"), password: "NewPassword1", expectedVersion: created.version }, "reset");
    assert.equal(reset.version, 2);
    assert.equal(accounts.rows.get("editor1")?.password, "NewPassword1");
    assert.deepEqual(accounts.kicked, [created.userId]);
    const disabled = await backend.writeUser(created.userId, { username: "editor1", displayName: "后台编辑", role: "CONTENT_MANAGER", enabled: false, expectedVersion: reset.version }, "disable");
    assert.equal(disabled.enabled, false);
    assert.deepEqual(accounts.kicked, [created.userId, created.userId]);
    const listed = (await backend.users()).find((u) => u.userId === created.userId)!;
    assert.equal(listed.username, "editor1");
  });
});

test("failed document write removes the login created moments before", async () => {
  const repo = new Harness(); await bootstrapTestRepo(repo, "test-admin");
  const accounts = new FakeAccounts();
  const backend = new DomainBackend(repo, { async subject() { return "test-admin"; } }, { async upload() { throw new Error("unused"); }, async download() { throw new Error("unused"); } }, accounts);
  await actorContext.run(await backend.authenticate("test"), async () => {
    repo.fail = true;
    await assert.rejects(backend.writeUser(undefined, body("rolled-back"), randomUUID()), /INJECTED/);
    repo.fail = false;
    assert.equal(accounts.rows.size, 0);
    assert.equal((await backend.users()).length, 1);
  });
});
