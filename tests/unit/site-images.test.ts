import test from "node:test";
import assert from "node:assert/strict";
import { createSiteImageResolver } from "../../apps/mobile/src/site-images";

test("mini-program site image cache keeps deletion tombstones and isolates out-of-order native writes", async () => {
  const writes: { filePath: string; success: () => void; fail: () => void }[] = [], removed: string[] = [];
  const resolve = createSiteImageResolver({ writeFile(options) { writes.push(options); }, unlink(options) { removed.push(options.filePath); } }, "/test-only");
  const image = "data:image/png;base64,AAAA";
  const first = resolve(image, "banner", 1); assert.equal(writes.length, 1);
  assert.equal(await resolve(null, "banner", 2), null);
  writes[0].success(); assert.equal(await first, null); assert.ok(removed.includes(writes[0].filePath));
  assert.equal(await resolve(image, "banner", 1), null); assert.equal(writes.length, 1);
  // A schedule can hide/show an image without a configuration version change.
  const second = resolve(image, "banner", 2); assert.equal(writes.length, 2);
  assert.equal(await resolve(null, "banner", 2), null);
  const third = resolve(image, "banner", 2); assert.equal(writes.length, 3);
  assert.notEqual(writes[1].filePath, writes[2].filePath);
  writes[2].success(); const latest = await third; assert.equal(latest, writes[2].filePath);
  writes[1].success(); assert.equal(await second, null); assert.equal(await resolve(image, "banner", 2), latest);
  assert.ok(!removed.includes(latest!));
  const failed = resolve("data:image/jpeg;base64,BBBB", "official-qr", 3); writes[3].fail(); assert.equal(await failed, null);
  const retry = resolve("data:image/jpeg;base64,BBBB", "official-qr", 3); writes[4].success(); assert.equal(await retry, writes[4].filePath);
});


test("mini image cache removes only generated files left by an earlier launch before writing", async () => {
  const removed: string[] = [];
  const resolve = createSiteImageResolver({
    readdir(options) { options.success({ files: ["zj-banner-1.png", "zj-official-qr-2-3.jpg", "user-photo.png", "zj-banner-secret.txt"] }); },
    unlink(options) { removed.push(options.filePath); options.success?.(); },
    writeFile(options) { options.success(); },
  }, "/isolated-cache");
  const path = await resolve("data:image/png;base64,AAAA", "banner", 4);
  assert.equal(path, "/isolated-cache/zj-banner-4-1.png");
  assert.deepEqual(removed, ["/isolated-cache/zj-banner-1.png", "/isolated-cache/zj-official-qr-2-3.jpg"]);
});
