import { test, expect, urls } from "./support";
import path from "node:path";

test.afterEach(async ({ request }) => {
  const endpoint = urls.api + "/api/v1/admin/site-contact", headers = { Authorization: "Bearer local-admin" };
  const current = await request.get(endpoint, { headers });
  if (current.ok()) {
    const data = (await current.json()).data;
    await request.put(endpoint, { headers, data: { expectedVersion: data.version, officialQr: null, serviceQr: null, phone: "400-685-0800" } });
  }
});

test("contact settings update H5 with QR placeholders and editable phone", async ({ page }) => {
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  const settings = page.locator(".contact-settings");
  await expect(settings.getByRole("heading", { name: "联系方式配置" })).toBeVisible();
  await expect(settings.getByText("未上传")).toHaveCount(2);
  await settings.getByLabel("上传或替换公众号二维码").setInputFiles(path.resolve("tests/fixtures/validation/page-1.png"));
  await settings.getByLabel("官方电话").fill("400-000-0000");
  await settings.getByRole("button", { name: "保存联系方式" }).click();
  await expect(settings.getByRole("status")).toHaveText("联系方式已保存。");
  const mobile = await page.context().newPage(); await mobile.setViewportSize({ width: 390, height: 844 }); await mobile.goto(urls.h5);
  const contact = mobile.locator(".contact-block");
  await expect(contact.getByText("联系方式", { exact: true })).toBeVisible();
  await expect(contact.getByText("400-000-0000")).toBeVisible();
  await expect(contact.getByText("暂未配置", { exact: true })).toHaveCount(1);
  await expect(contact.getByRole("button", { name: "拨打" })).toBeEnabled();
  await mobile.close();
  await settings.getByRole("button", { name: "删除公众号二维码" }).click();
  await settings.getByLabel("官方电话").fill("400-685-0800");
  await settings.getByRole("button", { name: "保存联系方式" }).click();
  await expect(settings.getByRole("status")).toHaveText("联系方式已保存。");
});
