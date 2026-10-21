import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeMockServer } from "../../services/mock-api/src/server";
import {
  guardMockEnvironment,
  requireRealConfiguration,
} from "../../services/api/src/config";
test("loopback API preserves private baseline, supports contracts, and validates write requests", async () => {
  const server = makeMockServer({ APP_ENV: "test" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  const read = async (path: string, auth = true) => {
    const response = await fetch(base + path, {
      headers: auth ? { Authorization: "Bearer local-mock" } : {},
    });
    return { response, body: await response.json() };
  };
  try {
    const anonymous = await read("/api/v1/admin/products", false);
    assert.equal(anonymous.response.status, 401);
    const rows = await read("/api/v1/admin/products");
    assert.equal(rows.response.status, 200);
    assert.equal(rows.body.data.length, 20);
    assert.equal(rows.response.headers.get("cache-control"), "no-store");
    const second = await read(
      "/api/v1/admin/products?cursor=" +
        encodeURIComponent(rows.body.page.nextCursor),
    );
    assert.equal(second.body.data.length, 7);
    assert.equal(
      new Set([...rows.body.data, ...second.body.data].map((p) => p.productId))
        .size,
      27,
    );
    assert.equal(
      (
        await read(
          "/api/v1/admin/products?q=x&cursor=" +
            encodeURIComponent(rows.body.page.nextCursor),
        )
      ).response.status,
      400,
    );
    const draft = await read("/api/v1/admin/products/ZJ-001/draft");
    assert.equal(draft.body.data.content.name, "保密工作管理系统");
    assert.equal(draft.body.data.updatedAt, null);
    assert.equal(
      (await read("/api/v1/admin/products?q=" + encodeURIComponent("[")))
        .response.status,
      200,
    );
    assert.equal(
      (
        await read(
          "/api/v1/admin/products?q=" + encodeURIComponent("文".repeat(101)),
        )
      ).response.status,
      400,
    );
    for (const path of [
      "/catalog/products",
      "/catalog/categories",
      "/catalog/materials",
    ]) {
      const r = await read("/api/v1" + path, false);
      assert.deepEqual(r.body.data, []);
      assert.ok(!JSON.stringify(r.body).includes("保密工作管理系统"));
    }
    assert.equal(
      (await read("/api/v1/catalog/products/ZJ-001", false)).response.status,
      404,
    );
    const categories = await read("/api/v1/admin/categories");
    assert.equal(categories.body.data.length, 4);
    assert.equal(
      categories.body.data.reduce(
        (n: number, c: { referenceCount: number }) => n + c.referenceCount,
        0,
      ),
      27,
    );
    const template = await read(
      "/api/v1/admin/templates?templateId=software&version=1",
    );
    assert.equal(template.body.data.length, 1);
    assert.equal(template.body.data[0].id, "software");
    assert.equal(
      (await read("/api/v1/admin/templates?version=bad")).response.status,
      400,
    );
    assert.equal(
      (await read("/api/v1/admin/me")).body.data.role,
      "CONTENT_MANAGER",
    );
    const write = await fetch(base + "/api/v1/admin/products", {
      method: "POST",
      headers: { Authorization: "Bearer local-mock" },
    });
    assert.equal(write.status, 400);
    for (const forbidden of ["reviews", "grants", "download"])
      assert.equal(
        (await read("/api/v1/" + forbidden, false)).response.status,
        404,
      );
    const cors = await fetch(base + "/api/v1/admin/products", {
      headers: {
        Origin: "https://untrusted.example",
        Authorization: "Bearer local-mock",
      },
    });
    assert.equal(cors.status, 403);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("production never silently falls back to mock", () => {
  assert.throws(() => guardMockEnvironment({ APP_ENV: "production" }));
  assert.throws(() => guardMockEnvironment({ NODE_ENV: "production" }));
  assert.throws(() => guardMockEnvironment({ DATA_PROVIDER: "cloudbase" }));
  assert.doesNotThrow(() =>
    guardMockEnvironment({ APP_ENV: "test", DATA_PROVIDER: "mock" }),
  );
  assert.throws(() => requireRealConfiguration({ DATA_PROVIDER: "mock" }));
  assert.throws(() => requireRealConfiguration({ DATA_PROVIDER: "cloudbase" }));
});
