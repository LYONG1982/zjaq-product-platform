import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";
test("site contact is admin-managed, versioned, validated and publicly readable", async () => {
  const store = new MockStore(undefined, true), server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`, image = "data:image/png;base64," + (await readFile(new URL("../fixtures/validation/page-1.png", import.meta.url))).toString("base64");
  const put = (token: string, body: unknown) => fetch(base + "/admin/site-contact", { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    const defaults = (await (await fetch(base + "/catalog/site-contact")).json()).data;
    assert.equal(defaults.phone, "400-685-0800");
    assert.equal(defaults.officialQr, null); assert.equal(defaults.serviceQr, null);
    const body = { expectedVersion: 0, officialQr: image, serviceQr: null, phone: "400-000-0000" };
    assert.equal((await put("local-mock", body)).status, 403);
    assert.equal((await put("local-admin", { ...body, phone: "not-a-phone" })).status, 422);
    assert.equal((await put("local-admin", body)).status, 200);
    assert.equal((await put("local-admin", body)).status, 409);
    const publicData = (await (await fetch(base + "/catalog/site-contact")).json()).data;
    assert.equal(publicData.officialQr, image); assert.equal(publicData.serviceQr, null); assert.equal(publicData.phone, "400-000-0000");
    assert.equal((await put("local-admin", { expectedVersion: 1, officialQr: null, serviceQr: null, phone: null })).status, 200);
    assert.equal(store.events.filter((event) => event.action === "UPDATE_SITE_CONTACT").length, 2);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(store.assets.directory, { recursive: true, force: true }); }
});
