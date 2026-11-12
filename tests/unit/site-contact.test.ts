import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile, rm } from "node:fs/promises";
import { TestStore } from "../support/store";
import { makeTestServer } from "../support/server";
test("site contact is admin-managed, versioned, validated and publicly readable", async () => {
  const store = new TestStore(undefined, true), server = makeTestServer({ APP_ENV: "test", ENABLE_MOCK_ROLES: "true" }, store);
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

test("contact images accept the exact 240 KiB boundary and report their own limit without changing Banner", async () => {
  const { crc32 } = await import("node:zlib");
  const { validateSiteContact } = await import("../../services/domain/src/site-contact");
  const { validateSiteImage } = await import("../../services/domain/src/site-banner");
  const png = await readFile(new URL("../fixtures/validation/page-1.png", import.meta.url));
  function padded(size: number) {
    const text = Buffer.alloc(size - png.length - 12, 32); text.write("padding\0");
    const chunk = Buffer.concat([Buffer.from("tEXt"), text]);
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(text.length); checksum.writeUInt32BE(crc32(chunk));
    const result = Buffer.concat([png.subarray(0, -12), length, chunk, checksum, png.subarray(-12)]);
    assert.equal(result.length, size);
    return "data:image/png;base64," + result.toString("base64");
  }
  const body = { expectedVersion: 0, officialQr: padded(240 * 1024), serviceQr: null, phone: null };
  await validateSiteContact(body);
  await assert.rejects(validateSiteContact({ ...body, officialQr: padded(240 * 1024 + 1) }), /240 KiB/);
  await validateSiteImage(padded(400 * 1024));
  await assert.rejects(validateSiteImage(padded(400 * 1024 + 1)), /400 KiB/);
  await assert.rejects(validateSiteContact({ ...body, officialQr: "data:image/png;base64," + Buffer.from("not an image").toString("base64") }), /图片无法读取/);
});
