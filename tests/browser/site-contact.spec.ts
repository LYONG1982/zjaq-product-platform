import { test, expect, urls } from "./support";
import type { APIRequestContext, Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "../../packages/api-client/src/index";
import type { Responses } from "@zj/contracts";

const headers = { Authorization: "Bearer local-admin" };
const endpoint = urls.api + "/api/v1/admin/site-contact";
const qr = createRequire(new URL("../../packages/api-client/package.json", import.meta.url))("qrcode");
let official: Buffer, service: Buffer, productId: string;
let previous: Responses["SiteContact"];
const dataUrl = (bytes: Buffer) => "data:image/png;base64," + bytes.toString("base64");
const uploadFile = (bytes: Buffer, name = "测试二维码.png") => ({ name, mimeType: "image/png", buffer: bytes });

async function assertIsolated(request: APIRequestContext) {
  // This suite writes configuration. Never run it against existing UAT or production.
  expect(urls.api).toBe("http://127.0.0.1:3423");
  expect(process.env.CONTACT_QR_TEST_SESSION).toMatch(/^[a-f0-9-]{36}$/);
  const health = await (await request.get(urls.api + "/health")).json();
  expect(health.provider).toBe("mock");
  expect(health.sessionId).toBe(process.env.CONTACT_QR_TEST_SESSION);
}
async function current(request: APIRequestContext): Promise<Responses["SiteContact"]> {
  const response = await request.get(endpoint, { headers }); expect(response.ok()).toBeTruthy();
  return (await response.json()).data;
}
async function update(request: APIRequestContext, value: Partial<Responses["SiteContact"]>) {
  const old = await current(request);
  const response = await request.put(endpoint, { headers, data: {
    expectedVersion: old.version, officialQr: old.officialQr, serviceQr: old.serviceQr, phone: old.phone, ...value, version: undefined,
  } }); expect(response.ok(), await response.text()).toBeTruthy();
}
async function settings(page: Page) {
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  await page.getByRole("navigation", { name: "设置快捷入口" }).getByRole("button", { name: "H5 底部联系方式", exact: true }).click();
  const card = page.locator(".contact-settings");
  await expect(card.getByLabel("官方电话")).toBeEnabled(); return card;
}
async function home(page: Page) {
  const target = urls.h5 + "/#/pages/home/index";
  if (page.url() === target) await page.reload(); else await page.goto(target);
  await expect(page.locator(".home-banner")).toBeVisible();
}

test.beforeAll(async ({ request }) => {
  await assertIsolated(request);
  official = await qr.toBuffer("https://example.invalid/contact-test/official", { width: 320, margin: 4 });
  service = await qr.toBuffer("https://example.invalid/contact-test/service", { width: 320, margin: 4 });
  const api = createClient(urls.api + "/api/v1", undefined, "local-admin");
  const draft = (await api.create({ name: "(测试)二维码展示", owner: "虚构验收人", model: "QR-" + randomUUID(), productType: "SOFTWARE", ownership: "SELF_DEVELOPED", categoryId: "miding", templateId: "software", templateVersion: 1 }, randomUUID())).data;
  const pdf = await readFile(new URL("../fixtures/validation/sample-v1.pdf", import.meta.url));
  const intent = (await api.createUpload({ productId: draft.productId, fileName: "验证资料.pdf", purpose: "preview", contentType: "application/pdf", size: pdf.length }, randomUUID())).data;
  await api.putBytes(intent.uploadId, new Blob([new Uint8Array(pdf)]));
  const asset = (await api.completeUpload(intent.uploadId)).data; expect(asset.status).toBe("READY");
  const saved = (await api.save(draft.productId, { expectedDraftVersion: draft.draftVersion, content: { ...draft.content,
    tagline: "仅用于隔离验收", summary: "虚构产品，仅用于二维码展示验证。", audiences: "验证人员",
    problemValues: [{ id: "p", title: "验证", text: "虚构测试" }], features: [{ id: "f", title: "验证", text: "虚构测试" }], scenarios: [{ id: "s", title: "验证", text: "虚构测试" }],
    materials: [{ materialId: "qr-test", versionId: randomUUID(), name: "虚构验证资料", kind: "brochure", category: "promotional", subCategory: "onepager", versionLabel: "V01.0", preview: { kind: "pdf", assetId: asset.assetId!, pageCount: asset.pageCount! } }],
  } })).data;
  await api.publish(draft.productId, { expectedDraftVersion: saved.draftVersion, expectedPublicationVersion: 0, publicContentConfirmed: true }, randomUUID());
  productId = (await api.shareTarget(draft.productId)).data.publicId;
});
test.beforeEach(async ({ request }) => {
  await assertIsolated(request); previous = await current(request);
  await update(request, { officialQr: null, serviceQr: null, phone: "400-000-0000" });
});
test.afterEach(async ({ request }) => {
  await assertIsolated(request);
  if (previous) await update(request, previous);
});

test("admin stages images, saves a shared home/detail configuration, removes and undoes without publishing", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const card = await settings(page);
  await expect(card.getByRole("button", { name: "保存并生效", exact: true })).toBeDisabled();
  await card.getByLabel("上传或替换公众号二维码").setInputFiles(uploadFile(official));
  await card.getByLabel("上传或替换客服二维码").setInputFiles(uploadFile(service));
  await expect(card.getByText("已选择，尚未保存", { exact: true })).toHaveCount(2);
  expect((await current(request)).officialQr).toBeNull();
  await expect(card.locator(".preview-qr")).toHaveCount(2);
  await card.locator('[data-qr="officialQr"]').getByRole("button", { name: "查看大图" }).click();
  await expect(page.getByRole("dialog", { name: "官方公众号二维码", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭官方公众号二维码", exact: true }).click();
  await card.getByRole("button", { name: "保存并生效", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("已保存，H5");
  expect((await current(request)).officialQr).toBe(dataUrl(official));
  await card.screenshot({ path: "work/contact-qr/admin-configured.png" });
  const mobile = await page.context().newPage(); await mobile.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/#/pages/home/index", "/#/pages/detail/index?id=" + productId]) {
    await mobile.goto(urls.h5 + path); await expect(mobile.locator(".h5-contact .qr-open img")).toHaveCount(2);
    await expect(mobile.locator(".h5-contact .qr-open img").first()).toHaveAttribute("src", dataUrl(official));
  }
  const serviceCard = card.locator('[data-qr="serviceQr"]');
  await serviceCard.getByRole("button", { name: "移除", exact: true }).click();
  await expect(serviceCard.getByText("待移除，保存后生效")).toBeVisible(); expect((await current(request)).serviceQr).toBe(dataUrl(service));
  await card.getByRole("button", { name: "撤销本次修改" }).click(); await expect(serviceCard.locator(".contact-thumbnail img")).toHaveCount(1);
  await serviceCard.getByRole("button", { name: "移除", exact: true }).click();
  await card.getByRole("button", { name: "保存并生效", exact: true }).click(); await expect(card.getByRole("status")).toContainText("已保存，H5");
  await home(mobile); await expect(mobile.locator(".contact-qrs.single .contact-qr")).toHaveCount(1);
  await mobile.locator(".h5-contact").screenshot({ path: "work/contact-qr/h5-single.png" });
  await card.locator('[data-qr="officialQr"]').getByRole("button", { name: "移除", exact: true }).click();
  await card.getByRole("button", { name: "保存并生效", exact: true }).click(); await expect(card.getByRole("status")).toContainText("已保存，H5");
  await home(mobile); await expect(mobile.locator(".h5-contact .contact-qrs")).toHaveCount(0); await expect(mobile.getByText("400-000-0000", { exact: true })).toBeVisible();
  await card.getByLabel("官方电话").fill(""); await card.getByRole("button", { name: "保存并生效", exact: true }).click(); await expect(card.getByRole("status")).toContainText("已保存，H5");
  await home(mobile); await expect(mobile.locator(".h5-contact")).toHaveCount(0); await mobile.close();
});

for (const width of [320, 390, 430]) test(`H5 QR layout and native image dialog at ${width}px`, async ({ page, request }) => {
  await update(request, { officialQr: dataUrl(official), serviceQr: dataUrl(service) });
  await page.setViewportSize({ width, height: 844 }); await home(page);
  const contact = page.locator(".h5-contact"), open = contact.getByRole("button", { name: "查看官方公众号二维码大图" });
  await open.scrollIntoViewIfNeeded();
  await expect(contact.locator(".qr-open img")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  const cards = await contact.locator(".contact-qr").all();
  const first = (await cards[0].boundingBox())!, second = (await cards[1].boundingBox())!;
  expect(first.y).toBe(second.y); expect(first.x + first.width).toBeLessThan(second.x);
  const image = (await open.boundingBox())!; expect(Math.abs(image.width - image.height)).toBeLessThan(1);
  const nav = (await page.getByRole("navigation", { name: "主导航" }).boundingBox())!;
  expect(image.y + image.height).toBeLessThanOrEqual(nav.y);
  await contact.screenshot({ path: `work/contact-qr/h5-contact-${width}.png` });
  await open.focus(); const beforeOpenScroll = await page.evaluate(() => scrollY);
  if (width === 320) await page.keyboard.press("Enter"); else await open.click(); const dialog = page.getByRole("dialog", { name: "官方公众号二维码大图", exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.locator("img")).toHaveAttribute("src", dataUrl(official));
  const scroll = beforeOpenScroll;
  expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(2);
  const dialogBounds = (await dialog.boundingBox())!; expect(dialogBounds.x).toBeGreaterThanOrEqual(0); expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(width);
  expect(Math.abs(dialogBounds.x - (width - dialogBounds.width) / 2)).toBeLessThan(1);
  expect(Math.abs(dialogBounds.y - (844 - dialogBounds.height) / 2)).toBeLessThan(1);
  if (width === 390) await page.screenshot({ path: "work/contact-qr/h5-large-image.png" });
  if (width === 320) await page.keyboard.press("Escape"); else await dialog.getByRole("button", { name: "关闭二维码大图" }).click();
  await expect(dialog).toHaveCount(0); expect(Math.abs(await page.evaluate(() => scrollY) - scroll)).toBeLessThan(2);
  await expect(open).toBeFocused(); expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("invalid images and failed saves preserve the selected original and edited phone", async ({ page, request }) => {
  await update(request, { officialQr: dataUrl(official) }); const card = await settings(page);
  const file = card.getByLabel("上传或替换公众号二维码");
  for (const bytes of [Buffer.from("broken png"), Buffer.alloc(240 * 1024 + 1)]) {
    await file.setInputFiles(uploadFile(bytes)); await expect(card.locator('[data-qr="officialQr"] [role="alert"]')).toBeVisible();
    await expect(card.locator('.contact-thumbnail img')).toHaveAttribute("src", dataUrl(official));
  }
  await card.getByLabel("上传或替换客服二维码").setInputFiles(uploadFile(service));
  await card.getByLabel("官方电话").fill("400-111-2222");
  let fail = true;
  await page.route("**/api/v1/admin/site-contact", async route => {
    if (route.request().method() === "PUT" && fail) { fail = false; await route.fulfill({ status: 503, json: { error: { code: "SERVER_UNAVAILABLE", message: "隔离服务失败验证" } } }); }
    else await route.continue();
  });
  await card.getByRole("button", { name: "保存并生效", exact: true }).click(); await expect(card.locator(".contact-error")).toContainText("隔离服务失败验证");
  await expect(card.getByLabel("官方电话")).toHaveValue("400-111-2222");
  await expect(card.locator('[data-qr="serviceQr"] .contact-thumbnail img')).toHaveAttribute("src", dataUrl(service));
  expect((await current(request)).serviceQr).toBeNull();
  await card.getByRole("button", { name: "保存并生效", exact: true }).click(); await expect(card.getByRole("status")).toContainText("已保存，H5");
});

test("failed initial read blocks writes and version conflicts require an explicit reload", async ({ page, request }) => {
  let fail = true;
  await page.route("**/api/v1/admin/site-contact", async route => {
    if (route.request().method() === "GET" && fail) await route.fulfill({ status: 503, json: { error: { code: "SERVER_UNAVAILABLE", message: "隔离读取失败" } } });
    else await route.continue();
  });
  await page.goto(urls.admin); await page.getByRole("button", { name: "系统设置", exact: false }).click();
  const card = page.locator(".contact-settings"); await expect(card.getByLabel("官方电话")).toBeDisabled();
  await expect(card.getByRole("button", { name: "保存并生效", exact: true })).toBeDisabled();
  fail = false; await card.getByRole("button", { name: "重新加载", exact: true }).click(); await expect(card.getByLabel("官方电话")).toBeEnabled();
  await card.getByLabel("官方电话").fill("400-111-2222"); await update(request, { phone: "400-333-4444" });
  await card.getByRole("button", { name: "保存并生效", exact: true }).click(); await expect(card.locator(".contact-error")).toContainText("其他管理员");
  expect((await current(request)).phone).toBe("400-333-4444"); await expect(card.getByLabel("官方电话")).toHaveValue("400-111-2222");
  await card.getByRole("button", { name: "重新读取最新配置" }).click();
  const dialog = page.getByRole("dialog", { name: "有未保存的联系方式" }); await dialog.getByRole("button", { name: "放弃修改并继续" }).click();
  await expect(card.getByLabel("官方电话")).toHaveValue("400-333-4444");
});

test("unsaved changes guard module navigation, logout and browser unload; saved changes do not prompt", async ({ page, request }) => {
  const card = await settings(page); await card.getByLabel("官方电话").fill("400-111-2222");
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBeTruthy();
  await page.getByRole("button", { name: "产品管理", exact: false }).click();
  let dialog = page.getByRole("dialog", { name: "有未保存的联系方式" }); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "继续编辑", exact: true }).click(); await expect(card.getByLabel("官方电话")).toHaveValue("400-111-2222");
  await page.getByRole("button", { name: "产品管理", exact: false }).click(); await dialog.getByRole("button", { name: "保存并继续", exact: true }).click();
  await expect(card).toHaveCount(0); expect((await current(request)).phone).toBe("400-111-2222");
  await page.getByRole("button", { name: "系统设置", exact: false }).click(); await expect(card.getByLabel("官方电话")).toBeEnabled();
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBeFalsy();
  await card.getByLabel("官方电话").fill("400-999-8888"); await page.getByRole("button", { name: "退出登录", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "有未保存的联系方式" }); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "放弃修改并继续", exact: true }).click(); await expect(page.locator(".admin-shell")).toHaveCount(0);
  expect((await current(request)).phone).toBe("400-111-2222");
});

test("latest file selection wins and save is disabled while an earlier file is still reading", async ({ page }) => {
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function(blob: Blob) {
      if (blob instanceof File && blob.name === "slow.png") setTimeout(() => original.call(this, blob), 700);
      else original.call(this, blob);
    };
  });
  const card = await settings(page), file = card.getByLabel("上传或替换公众号二维码");
  await file.setInputFiles(uploadFile(official, "slow.png"));
  await expect(card.getByRole("button", { name: "保存并生效", exact: true })).toBeDisabled();
  await file.setInputFiles(uploadFile(service, "latest.png"));
  await expect(card.locator(".contact-thumbnail img")).toHaveAttribute("src", dataUrl(service));
  await page.waitForTimeout(850); // Deliberate race fixture: allow the older FileReader callback to arrive.
  await expect(card.locator(".contact-thumbnail img")).toHaveAttribute("src", dataUrl(service));
  await card.getByRole("button", { name: "撤销本次修改" }).click(); await expect(card.locator(".contact-thumbnail img")).toHaveCount(0);
});

test("H5 distinguishes unavailable settings from broken images and preserves content after refresh failure", async ({ page, request }) => {
  await update(request, { officialQr: dataUrl(official) }); let mode: "fail" | "broken" | "ok" = "fail";
  await page.route("**/api/v1/catalog/site-contact", async route => {
    if (mode === "fail") await route.fulfill({ status: 503, json: { error: { code: "SERVER_UNAVAILABLE", message: "隔离读取失败" } } });
    else if (mode === "broken") { const response = await route.fetch(); const body = await response.json(); body.data.officialQr = "data:image/png;base64,YnJva2Vu"; await route.fulfill({ response, json: body }); }
    else await route.continue();
  });
  await home(page); const contact = page.locator(".h5-contact"); await expect(contact).toContainText("联系方式暂时无法加载");
  mode = "broken"; await contact.getByRole("button", { name: "重新加载联系方式", exact: true }).click(); await expect(contact.getByRole("button", { name: "二维码加载失败，点击重试", exact: true })).toBeVisible();
  await expect(contact).not.toContainText("暂未配置");
  mode = "ok"; await contact.getByRole("button", { name: "二维码加载失败，点击重试", exact: true }).click(); await expect(contact.locator(".qr-open img")).toHaveAttribute("src", dataUrl(official));
  mode = "fail";
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "产品", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "首页", exact: true }).click();
  await expect(contact).toContainText("当前显示上次读取的内容"); await expect(contact.locator(".qr-open img")).toHaveAttribute("src", dataUrl(official));
  mode = "ok"; await contact.getByRole("button", { name: "重新加载联系方式", exact: true }).click(); await expect(contact.locator(".contact-load-error")).toHaveCount(0);
});
