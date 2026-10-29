import { test, expect, urls, publicProductId } from "./support";
const headers = { Authorization: "Bearer local-admin" };
test.afterEach(async ({ request }) => {
  const endpoint = urls.api + "/api/v1/admin/analytics/settings", response = await request.get(endpoint, { headers });
  if (response.ok()) { const settings = (await response.json()).data; await request.put(endpoint, { headers, data: { expectedVersion: settings.version, viewEnabled: false, downloadEnabled: false, dashboardEnabled: false } }); }
});

test("admin analytics controls, successful H5 view, page dedup, browse records and disabled dashboard work together", async ({ page, request }) => {
  const settingUrl = urls.api + "/api/v1/admin/analytics/settings";
  const settings = (await (await request.get(settingUrl, { headers })).json()).data;
  await request.put(settingUrl, { headers, data: { expectedVersion: settings.version, viewEnabled: false, downloadEnabled: false, dashboardEnabled: false } });
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "数据看板", exact: false }).click();
  await expect(page.getByText(/数据看板已关闭，请在系统设置/)).toBeVisible();
  await expect(page.locator(".analytics-counts")).toHaveCount(0);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  const panel = page.locator(".analytics-panel");
  await panel.getByLabel("展示数据看板").check();
  await panel.getByLabel("采集小程序和 H5 资料浏览量").check();
  await panel.getByLabel("采集销售端完整下载量").check();
  await panel.getByRole("button", { name: "保存统计设置" }).click();
  await expect(panel.getByRole("status")).toContainText("统计设置已保存");
  const initial = (await (await request.get(urls.api + "/api/v1/admin/analytics/summary", { headers })).json()).data.views;
  const publicId = await publicProductId(request, "【Demo】资料问答助手");
  const h5 = await page.context().newPage(); await h5.setViewportSize({ width: 390, height: 844 });
  await h5.goto(urls.h5 + "/#/pages/viewer/index?productId=" + publicId + "&materialId=demo-introduction");
  await expect(h5.locator(".analytics-notice")).toContainText("最多保留 90 天");
  await expect(h5.locator(".surface canvas")).toBeVisible();
  await expect.poll(async () => (await (await request.get(urls.api + "/api/v1/admin/analytics/summary", { headers })).json()).data.views).toBe(initial + 1);
  await h5.locator("uni-button").filter({ hasText: "下一页" }).click();
  await expect(h5.locator(".controls input")).toHaveValue("2");
  expect((await (await request.get(urls.api + "/api/v1/admin/analytics/summary", { headers })).json()).data.views).toBe(initial + 1);
  await page.getByRole("button", { name: "数据看板", exact: false }).click();
  await expect(page.locator(".analytics-counts>div").filter({ hasText: "小程序 / H5 资料浏览" }).locator("strong")).toHaveText(String(initial + 1));
  await page.getByRole("button", { name: "操作记录", exact: false }).first().click();
  await page.getByRole("tab", { name: "浏览记录", exact: true }).click();
  const record = page.locator(".analytics-panel tbody tr").filter({ hasText: "资料问答助手 · 产品介绍" }).first();
  await expect(record).toContainText("H5"); await expect(record).toContainText("未记录");
  await page.screenshot({ path: "work/round04/analytics-browser-records.png", fullPage: true });
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  await panel.getByLabel("展示数据看板").uncheck(); await panel.getByLabel("采集小程序和 H5 资料浏览量").uncheck();
  await panel.getByRole("button", { name: "保存统计设置" }).click(); await expect(panel.getByRole("status")).toContainText("统计设置已保存");
  await h5.reload(); await expect(h5.locator(".surface canvas")).toBeVisible(); await expect(h5.locator(".analytics-notice")).toHaveCount(0);
  const logs = await request.get(urls.api + "/api/v1/admin/analytics/events?kind=VIEW", { headers }); expect((await logs.json()).data.length).toBe(initial + 1);
  expect((await request.get(urls.api + "/api/v1/admin/analytics/summary", { headers })).status()).toBe(403);
  expect((await request.get(urls.api + "/api/v1/admin/analytics/events")).status()).toBe(401);
  await h5.close();
});
