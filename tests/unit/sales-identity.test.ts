import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeMockServer } from "../../services/mock-api/src/server";
import { createClient } from "../../packages/api-client/src/index";

async function start(env: NodeJS.ProcessEnv) {
  const server = makeMockServer(env);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    server,
    base: "http://127.0.0.1:" + address.port + "/api/v1",
  };
}

test("mock sales identity is gated, isolated from admin routes, and disabled immediately", async () => {
  const disabledGate = await start({ APP_ENV: "test" });
  try {
    const unavailable = await fetch(disabledGate.base + "/sales/me", {
      headers: { Authorization: "Bearer local-sales" },
    });
    assert.equal(unavailable.status, 401);
  } finally {
    disabledGate.server.close();
    await once(disabledGate.server, "close");
  }

  const { server, base } = await start({
    APP_ENV: "test",
    ENABLE_MOCK_ROLES: "true",
  });
  const admin = createClient(base, undefined, "local-admin"),
    manager = createClient(base, undefined, "local-mock");
  try {
    assert.equal((await fetch(base + "/sales/me")).status, 401);
    assert.equal(
      (
        await fetch(base + "/sales/me", {
          headers: { Authorization: "Bearer local-mock" },
        })
      ).status,
      403,
    );
    const salesMe = await fetch(base + "/sales/me", {
      headers: { Authorization: "Bearer local-sales" },
    });
    assert.equal(salesMe.status, 200);
    assert.equal((await salesMe.json()).data.role, "SALES");

    for (const [method, path] of [
      ["GET", "/admin/products"],
      ["POST", "/admin/products"],
    ]) {
      const response = await fetch(base + path, {
        method,
        headers: { Authorization: "Bearer local-sales" },
      });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
    assert.equal((await manager.me()).data.role, "CONTENT_MANAGER");
    assert.equal((await admin.me()).data.role, "ADMIN");

    const salesUser = (await admin.users()).data.find(
      (user) => user.role === "SALES",
    );
    assert.ok(salesUser);
    await admin.updateUser(salesUser.userId, {
      subjectId: salesUser.subjectId,
      displayName: salesUser.displayName,
      role: "SALES",
      enabled: false,
      expectedVersion: salesUser.version,
    });
    const afterDisable = await fetch(base + "/sales/me", {
      headers: { Authorization: "Bearer local-sales" },
    });
    assert.equal(afterDisable.status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
