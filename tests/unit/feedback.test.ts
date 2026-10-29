import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";
test("feedback is validated and rate-limited, and only admins can list it", async () => {
  const store = new MockStore(undefined, true), server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const post = (body: unknown) => fetch(base + "/catalog/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ content: "   ", contact: "" })).status, 422);
    assert.equal((await post({ content: "a".repeat(1001), contact: "" })).status, 400);
    const first = await post({ content: "<img src=x onerror=alert(1)>", contact: "test contact" });
    assert.equal(first.status, 200); assert.deepEqual((await first.json()).data, { accepted: true });
    for (let i = 0; i < 4; i++) assert.equal((await post({ content: "test feedback", contact: "" })).status, 200);
    assert.equal((await post({ content: "test feedback", contact: "" })).status, 429);
    assert.equal((await fetch(base + "/admin/feedback")).status, 401);
    assert.equal((await fetch(base + "/admin/feedback", { headers: { Authorization: "Bearer local-mock" } })).status, 403);
    assert.equal((await fetch(base + "/admin/feedback", { headers: { Authorization: "Bearer local-sales" } })).status, 403);
    const rows = (await (await fetch(base + "/admin/feedback", { headers: { Authorization: "Bearer local-admin" } })).json()).data;
    assert.equal(rows.length, 5); assert.ok(rows.some((item: { content: string }) => item.content.includes("<img")));
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(store.assets.directory, { recursive: true, force: true }); }
});
