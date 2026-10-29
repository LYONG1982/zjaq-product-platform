import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";
import { validateSiteBanner, visibleSiteBanner } from "../../services/domain/src/site-banner";

test("banner schedule hides unapproved timing while the optional introduction remains available", async () => {
  const value = { expectedVersion: 0, imageData: null, link: "https://example.com", startsAt: "2026-10-29T09:00:00+08:00", endsAt: "2026-10-29T10:00:00+08:00", introduction: "官网介绍", introLink: "https://example.com/about" };
  const accepted = await validateSiteBanner(value);
  assert.equal(accepted.startsAt, "2026-10-29T01:00:00.000Z");
  const banner = { ...accepted, version: 1, imageData: "image" };
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T08:59:59+08:00")).imageData, null);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T09:00:00+08:00")).imageData, "image");
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T10:00:00+08:00")).imageData, null);
  assert.equal(visibleSiteBanner(banner, 0).introduction, "官网介绍");
  assert.equal(Object.hasOwn(visibleSiteBanner(banner), "startsAt"), false);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T08:59:59+08:00")).refreshAfterSeconds, 1);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T08:00:00+08:00")).refreshAfterSeconds, 30);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T09:59:59.900+08:00")).refreshAfterSeconds, 1);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T10:00:00+08:00")).refreshAfterSeconds, 30);
  await assert.rejects(validateSiteBanner({ ...value, startsAt: "2026-02-31T00:00:00Z" }));
  await assert.rejects(validateSiteBanner({ ...value, endsAt: value.startsAt }));
  await assert.rejects(validateSiteBanner({ ...value, introLink: "javascript:alert(1)" }));
  await assert.rejects(validateSiteBanner({ ...value, introduction: " " }));
});

test("site banner requires admin, validates image and link, and applies versioned changes publicly", async () => {
  const store = new MockStore(undefined, true), server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const image = "data:image/png;base64," + (await readFile(new URL("../fixtures/validation/page-1.png", import.meta.url))).toString("base64");
  const put = (token: string, body: unknown) => fetch(base + "/admin/site-banner", { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.deepEqual((await (await fetch(base + "/catalog/site-banner")).json()).data, { version: 0, imageData: null, link: null, refreshAfterSeconds: 30 });
    assert.equal((await put("local-mock", { expectedVersion: 0, imageData: image, link: null })).status, 403);
    assert.equal((await put("local-sales", { expectedVersion: 0, imageData: image, link: null })).status, 403);
    assert.equal((await put("local-admin", { expectedVersion: 0, imageData: image, link: "javascript:alert(1)" })).status, 422);
    assert.equal((await put("local-admin", { expectedVersion: 0, imageData: "data:image/png;base64,SGVsbG8=", link: null })).status, 422);
    assert.equal((await put("local-admin", { expectedVersion: 0, imageData: image, link: "/pages/products/index" })).status, 200);
    assert.equal((await put("local-admin", { expectedVersion: 0, imageData: null, link: null })).status, 409);
    const current = (await (await fetch(base + "/catalog/site-banner")).json()).data;
    assert.equal(current.version, 1); assert.equal(current.imageData, image); assert.equal(current.link, "/pages/products/index");
    assert.equal((await put("local-admin", { expectedVersion: 1, imageData: null, link: null })).status, 200);
    assert.equal((await (await fetch(base + "/catalog/site-banner")).json()).data.imageData, null);
    assert.equal(store.events.filter((e) => e.action === "UPDATE_SITE_BANNER").length, 2);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(store.assets.directory, { recursive: true, force: true }); }
});
