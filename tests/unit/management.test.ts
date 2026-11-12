import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeTestServer } from "../support/server";
import { createClient, ApiError } from "../../packages/api-client/src/index";
test("management API enforces roles, category references, conflict versions and immediate disable", async () => {
  const server = makeTestServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port + "/api/v1",
    admin = createClient(base, undefined, "local-admin"),
    manager = createClient(base, undefined, "local-mock");
  const reject = (code: number) => (e: unknown) =>
    e instanceof ApiError && e.status === code;
  try {
    await assert.rejects(manager.users(), reject(403));
    const c = (await admin.categories()).data[0];
    const body = {
      name: c.name,
      shortName: c.shortName,
      sortOrder: c.sortOrder,
      enabled: false,
      defaultTemplateId: c.defaultTemplateId,
      allowedTemplateIds: c.allowedTemplateIds,
      expectedVersion: c.version,
    };
    await assert.rejects(admin.updateCategory(c.id, body), reject(409));
    await assert.rejects(
      manager.createCategory({ ...body, name: "越权" }),
      reject(403),
    );
    const added = (
      await admin.createCategory({
        ...body,
        name: "测试分类",
        shortName: "测试",
        enabled: true,
      })
    ).data;
    const updated = (
      await admin.updateCategory(added.id, {
        ...body,
        name: "测试分类二",
        shortName: "测试",
        enabled: true,
        expectedVersion: added.version,
      })
    ).data;
    assert.equal(updated.version, 2);
    await assert.rejects(
      admin.updateCategory(added.id, {
        ...body,
        name: "冲突",
        expectedVersion: 1,
      }),
      reject(409),
    );
    const u = (await admin.users()).data.find(
      (u) => u.role === "CONTENT_MANAGER",
    )!;
    await admin.updateUser(u.userId, {
      username: u.username ?? "mock-content-manager",
      displayName: u.displayName,
      enabled: false,
      role: u.role,
      expectedVersion: u.version,
    });
    await assert.rejects(manager.me(), reject(401));
    const self = (await admin.users()).data.find(
      (u) => u.userId === "mock-admin",
    )!;
    await assert.rejects(
      admin.updateUser(self.userId, {
        username: self.username ?? "mock-admin",
        displayName: self.displayName,
        role: "CONTENT_MANAGER",
        enabled: true,
        expectedVersion: self.version,
      }),
      reject(409),
    );
    const other = (
      await admin.createUser({
        username: "isolated-admin",
        password: "Password123",
        displayName: "第二管理员",
        enabled: true,
        role: "ADMIN",
      })
    ).data;
    const results = await Promise.allSettled([
      admin.updateUser(self.userId, {
        username: self.username ?? "mock-admin",
        displayName: self.displayName,
        role: self.role,
        enabled: false,
        expectedVersion: self.version,
      }),
      admin.updateUser(other.userId, {
        username: other.username ?? "isolated-admin",
        displayName: other.displayName,
        role: other.role,
        enabled: false,
        expectedVersion: other.version,
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    server.close();
    await once(server, "close");
  }
});
test("admin test identity is unavailable unless explicitly enabled", async () => {
  const s = makeTestServer({ APP_ENV: "test" });
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  const a = s.address();
  assert.ok(a && typeof a === "object");
  try {
    const r = await fetch("http://127.0.0.1:" + a.port + "/api/v1/admin/me", {
      headers: { Authorization: "Bearer local-admin" },
    });
    assert.equal(r.status, 401);
  } finally {
    s.close();
    await once(s, "close");
  }
});
