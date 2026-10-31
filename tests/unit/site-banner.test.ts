import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { MockStore } from "../../services/mock-api/src/store";
import { makeMockServer } from "../../services/mock-api/src/server";
import type { Domain } from "@zj/contracts";
import { bannerFields, emptySiteBanner, normalizeSiteBanner, validateSiteBanner, visibleSiteBanner } from "../../services/domain/src/site-banner";

test("banner schedule always preserves the default and filters custom items by validity", async () => {
  const body: Domain["SiteBannerWrite"] = { expectedVersion: 0, items: [
    { id: "default", imageData: null, link: null, startsAt: null, endsAt: null },
    { id: "promo", imageData: null, link: "https://example.com", startsAt: "2026-10-29T09:00:00+08:00", endsAt: "2026-10-29T10:00:00+08:00" },
  ] };
  const img = "data:image/png;base64," + (await readFile(new URL("../fixtures/validation/page-1.png", import.meta.url))).toString("base64");
  body.items![1].imageData = img;
  const accepted = await validateSiteBanner(body);
  const banner = { version: 1, ...bannerFields(accepted) };
  assert.equal(banner.items[0].id, "default");
  assert.equal(banner.items[0].imagePath, "/api/v1/catalog/site-banner/default-image");
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T08:59:59+08:00")).items.length, 1);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T09:00:00+08:00")).items.length, 2);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T10:00:00+08:00")).items.length, 1);
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T08:59:59+08:00")).items[0].id, "default");
  assert.equal(visibleSiteBanner(banner, Date.parse("2026-10-29T08:59:59+08:00")).refreshAfterSeconds, 1);
});

test("legacy single-image records migrate on read and legacy PUTs preserve the default and other custom pages", () => {
  const legacy = normalizeSiteBanner({ version: 2, imageData: "data:image/png;base64,AA==", link: "https://example.com", introduction: "官网介绍" });
  assert.deepEqual(legacy.items.map(item => item.id), ["default", "legacy"]);
  assert.equal(legacy.items[0].link, null);
  const accepted = { expectedVersion: 2, imageData: null, link: null };
  const next = bannerFields(accepted, legacy);
  assert.deepEqual(next.items.map(item => item.id), ["default"]);
  const customOnly = normalizeSiteBanner({ ...legacy, items: [legacy.items[0], { ...legacy.items[1], id: "other" }] });
  const oldPut = bannerFields({ expectedVersion: 2, imageData: legacy.imageData, link: legacy.link }, customOnly);
  assert.deepEqual(oldPut.items.map(item => item.id), ["default", "legacy", "other"]);
  const fiveCustom = normalizeSiteBanner({ version: 3, items: [legacy.items[0], ...Array.from({ length: 5 }, (_, i) => ({ ...legacy.items[1], id: `custom-${i}` }))] });
  assert.throws(() => bannerFields({ expectedVersion: 3, imageData: legacy.imageData, link: legacy.link }, fiveCustom), /最多配置 5 张/);
  assert.equal(fiveCustom.items.length, 6);
  assert.equal(emptySiteBanner().items[0].id, "default");
});

test("banner writes reject deleting, moving, changing, overfilling, or invalidating the protected default", async () => {
  const base = { expectedVersion: 0, items: [{ id: "default", imageData: null, link: null, startsAt: null, endsAt: null }] };
  assert.equal((await validateSiteBanner(base)).items?.length, 1);
  for (const items of [[], [{ id: "custom", imageData: "x", link: null, startsAt: null, endsAt: null }], [
    { id: "custom", imageData: "x", link: null, startsAt: null, endsAt: null }, base.items[0],
  ], [{ ...base.items[0], link: "https://example.com" }]]) {
    await assert.rejects(validateSiteBanner({ expectedVersion: 0, items }));
  }
  for (const id of ["../image", "has space", "/absolute", "x?y"]) {
    await assert.rejects(validateSiteBanner({ expectedVersion: 0, items: [base.items[0], { id, imageData: "x", link: null, startsAt: null, endsAt: null }] }));
  }
  const tooMany = [base.items[0], ...Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, imageData: "data:image/png;base64,AA==", link: null, startsAt: null, endsAt: null }))];
  await assert.rejects(validateSiteBanner({ expectedVersion: 0, items: tooMany }));
  await assert.rejects(validateSiteBanner({ expectedVersion: 0, items: [{ ...base.items[0], startsAt: "2026-02-31T00:00:00Z" }] }));
});

test("site banner API enforces admin, version, custom image validation, and serves bundled default asset", async () => {
  const store = new MockStore(undefined, true), server = makeMockServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const image = "data:image/png;base64," + (await readFile(new URL("../fixtures/validation/page-1.png", import.meta.url))).toString("base64");
  const put = (token: string, body: unknown) => fetch(base + "/admin/site-banner", { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const def = { id: "default", imageData: null, link: null, startsAt: null, endsAt: null };
  try {
    const initial = (await (await fetch(base + "/catalog/site-banner")).json() as any).data;
    assert.deepEqual(initial.items.map((item: { id: string }) => item.id), ["default"]);
    assert.equal((await put("local-mock", { expectedVersion: 0, items: [def] })).status, 403);
    assert.equal((await put("local-sales", { expectedVersion: 0, items: [def] })).status, 403);
    assert.equal((await put("local-admin", { expectedVersion: 0, items: [] })).status, 400);
    assert.equal((await put("local-admin", { expectedVersion: 0, items: [{ ...def, link: "https://example.com" }] })).status, 422);
    assert.equal((await put("local-admin", { expectedVersion: 0, items: [def, { id: "a", imageData: "data:image/png;base64,SGVsbG8=", link: null, startsAt: null, endsAt: null }] })).status, 422);
    assert.equal((await put("local-admin", { expectedVersion: 0, items: [def, { id: "a", imageData: image, link: "/pages/products/index", startsAt: null, endsAt: null }] })).status, 200);
    assert.equal((await put("local-admin", { expectedVersion: 0, items: [def] })).status, 409);
    const current = (await (await fetch(base + "/catalog/site-banner")).json() as any).data;
    assert.deepEqual(current.items.map((item: { id: string }) => item.id), ["default", "a"]);
    assert.equal(current.imageData, image);
    const binary = await fetch(base + "/catalog/site-banner/default-image");
    assert.equal(binary.status, 200); assert.equal(binary.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await binary.arrayBuffer()), await readFile(new URL("../../services/domain/assets/default-banner.png", import.meta.url)));
    assert.equal((await put("local-admin", { expectedVersion: 1, items: [def] })).status, 200);
    assert.deepEqual((await (await fetch(base + "/catalog/site-banner")).json() as any).data.items.map((item: { id: string }) => item.id), ["default"]);
    assert.equal((await put("local-admin", { expectedVersion: 2, imageData: image, link: "https://example.com" })).status, 200);
    const legacy = (await (await fetch(base + "/catalog/site-banner")).json() as any).data;
    assert.deepEqual(legacy.items.map((item: { id: string }) => item.id), ["default", "legacy"]);
    assert.equal((await put("local-admin", { expectedVersion: 3, items: [def] })).status, 200);
    const tooLarge = await fetch(base + "/admin/site-banner", { method: "PUT", headers: { Authorization: "Bearer local-admin", "Content-Type": "application/json" }, body: " ".repeat(3 * 1024 * 1024 + 1) });
    assert.equal(tooLarge.status, 413);
    assert.equal(store.events.filter((e) => e.action === "UPDATE_SITE_BANNER").length, 4);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(store.assets.directory, { recursive: true, force: true }); }
});
