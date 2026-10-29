import { test, expect, urls } from "./support";
import path from "node:path";

test("admin replaces home banner and H5 displays it above search with a working internal link", async ({ page, request }) => {
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  const settings = page.locator(".banner-settings");
  await expect(settings.getByRole("heading", { name: "小程序首页 Banner" })).toBeVisible();
  await settings.getByLabel("上传或替换图片").setInputFiles(path.resolve("tests/fixtures/validation/page-1.png"));
  await expect(settings.getByAltText("当前 Banner 预览")).toBeVisible();
  await settings.getByLabel("跳转链接（可选）").fill("/pages/products/index");
  await settings.getByLabel("首页介绍位文字（可选）").fill("本地验证：官网介绍位");
  await settings.getByLabel("首页介绍位链接（可选）").fill("https://example.com/about");
  await settings.getByRole("button", { name: "保存 Banner" }).click();
  await expect(settings.getByRole("status")).toHaveText("Banner 已保存。");
  const mobile = await page.context().newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(urls.h5);
  const banner = mobile.locator(".home-banner"), search = mobile.locator(".search");
  await expect(banner).toBeVisible();
  await expect(mobile.getByRole("link", { name: "本地验证：官网介绍位" })).toBeVisible();
  const b = await banner.boundingBox(), s = await search.boundingBox();
  expect(b && s && b.y + b.height <= s.y).toBeTruthy();
  await banner.click();
  await expect(mobile.getByText("产品中心", { exact: true })).toBeVisible();
  await mobile.close();
  await settings.getByRole("button", { name: "移除图片" }).click();
  await settings.getByLabel("首页介绍位文字（可选）").fill("");
  await settings.getByLabel("首页介绍位链接（可选）").fill("");
  await settings.getByRole("button", { name: "保存 Banner" }).click();
  await expect(settings.getByRole("status")).toHaveText("Banner 已保存。");
  expect((await (await request.get(urls.api + "/api/v1/catalog/site-banner")).json()).data.imageData).toBeNull();
});

test("home refreshes a scheduled Banner while staying in the foreground and hides it at expiration", async ({ page, request }) => {
  const endpoint = urls.api + "/api/v1/admin/site-banner", headers = { Authorization: "Bearer local-admin" };
  const previous = (await (await request.get(endpoint, { headers })).json()).data;
  const { readFile } = await import("node:fs/promises");
  const imageData = "data:image/png;base64," + (await readFile("tests/fixtures/validation/page-1.png")).toString("base64");
  const now = Date.now();
  try {
    const response = await request.put(endpoint, { headers, data: { expectedVersion: previous.version, imageData, link: "/pages/products/index", startsAt: new Date(now + 4000).toISOString(), endsAt: new Date(now + 8000).toISOString(), introduction: null, introLink: null } });
    expect(response.status()).toBe(200);
    await page.goto(urls.h5);
    const banner = page.locator(".home-banner");
    await expect(banner).toHaveCount(0);
    await expect(banner).toBeVisible({ timeout: 7000 });
    await expect(banner).toHaveCount(0, { timeout: 7000 });
    expect(new URL(page.url()).hash).not.toContain("products");
  } finally {
    const latest = (await (await request.get(endpoint, { headers })).json()).data;
    await request.put(endpoint, { headers, data: { expectedVersion: latest.version, imageData: previous.imageData, link: previous.link, startsAt: previous.startsAt ?? null, endsAt: previous.endsAt ?? null, introduction: previous.introduction ?? null, introLink: previous.introLink ?? null } });
  }
});
