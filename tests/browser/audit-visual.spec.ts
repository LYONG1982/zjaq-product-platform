import { test, expect, urls } from "./support";

const requestLog: Array<{ url: string; path: string; method: string }> = [];
const sampleAudit = (id: string, reason: string) => ({
  eventId: id,
  actorId: "fictional-admin",
  actorName: "虚构管理员",
  action: "SAVE",
  targetId: "ZJ-DEMO-028-超长虚构编号-用于验证完整显示",
  draftVersion: 7,
  publicationVersion: null,
  releaseSequence: null,
  requestId: `fixture-${id}`,
  createdAt: "2026-10-29T02:30:00.000Z",
  reason,
});

async function mockAdmin(page: import("@playwright/test").Page, role: "ADMIN" | "CONTENT_MANAGER" | "UNAUTHENTICATED" = "ADMIN") {
  requestLog.length = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const path = requestUrl.pathname;
    requestLog.push({ url: request.url(), path, method: request.method() });
    if (request.method() !== "GET") {
      await route.fulfill({ status: 405, json: { error: "GET only in visual fixture" } });
      return;
    }
    if (role === "UNAUTHENTICATED") {
      await route.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED", message: "未登录" }, requestId: "fixture-unauthenticated" } });
      return;
    }
    let body: unknown;
    if (path.endsWith("/admin/me")) {
      body = { data: { userId: "fictional-user", subjectId: "fictional-subject", displayName: "虚构管理员", role, enabled: true }, requestId: "fixture-me" };
    } else if (path.endsWith("/admin/categories") || path.endsWith("/admin/templates")) {
      body = { data: [], page: { nextCursor: null, hasMore: false }, requestId: "fixture-list" };
    } else if (path.endsWith("/admin/products")) {
      body = { data: [], page: { nextCursor: null, hasMore: false }, requestId: "fixture-products" };
    } else if (path.endsWith("/admin/audit-events")) {
      const query = requestUrl.searchParams;
      if (query.get("productId") === "fixture-error") {
        await route.fulfill({ status: 503, json: { error: { code: "FIXTURE_UNAVAILABLE", message: "虚构读取错误" }, requestId: "fixture-audit-error" } });
        return;
      }
      if (query.get("productId") === "fixture-empty") {
        body = { data: [], page: { nextCursor: null, hasMore: false }, requestId: "fixture-audit-empty" };
        await route.fulfill({ status: 200, json: body });
        return;
      }
      const pageTwo = query.get("cursor") === "audit-next";
      body = { data: [sampleAudit(pageTwo ? "audit-2" : "audit-1", "虚构长原因：用于检查操作记录单元格换行和完整内容")], page: { nextCursor: pageTwo ? null : "audit-next", hasMore: !pageTwo }, requestId: "fixture-audit" };
    } else if (path.endsWith("/admin/analytics/events")) {
      const query = requestUrl.searchParams;
      if (query.get("q") === "fixture-error") {
        await route.fulfill({ status: 503, json: { error: { code: "FIXTURE_UNAVAILABLE", message: "虚构读取错误" }, requestId: "fixture-analytics-error" } });
        return;
      }
      if (query.get("q") === "fixture-empty") {
        body = { data: [], page: { nextCursor: null, hasMore: false }, requestId: "fixture-empty" };
      } else {
        const pageTwo = query.get("cursor") === "analytics-next";
        body = {
          data: [{ eventId: pageTwo ? "analytics-2" : "analytics-1", kind: "VIEW", productId: "fictional-product", productName: "虚构产品名称", materialId: "fictional-material", materialName: "用于验证长名称完整换行的虚构资料资料资料", versionId: "fictional-version", versionLabel: "虚构版本 1.0", occurredAt: "2026-10-29T02:30:00.000Z", client: "H5", sourceIp: "192.0.2.20", sharer: null, actorName: null }],
          page: { nextCursor: pageTwo ? null : "analytics-next", hasMore: !pageTwo }, requestId: "fixture-analytics",
        };
      }
    } else {
      await route.fulfill({ status: 404, json: { error: "unconfigured read-only fixture" } });
      return;
    }
    await route.fulfill({ status: 200, json: body });
  });
}

for (const width of [1440, 1280, 1024, 768, 720]) {
  test(`audit workspace stays within the viewport at ${width}px`, async ({ page }, testInfo) => {
    await mockAdmin(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(urls.admin);
    await page.getByRole("button", { name: "操作记录", exact: false }).first().click();
    const operations = page.locator(".audit-operations");
    await expect(operations).toBeVisible();
    await expect(operations.getByText("虚构长原因：用于检查操作记录单元格换行和完整内容")).toBeVisible();
    const operationRowHeight = await operations.locator("tbody tr").first().evaluate((row) => row.getBoundingClientRect().height);
    expect(operationRowHeight).toBeGreaterThanOrEqual(48);
    const query = operations.getByRole("button", { name: "筛选记录" });
    await expect(query).toHaveCSS("height", "40px");
    await expect(query).not.toHaveCSS("height", "auto");
    await page.screenshot({ path: testInfo.outputPath(`audit-operations-${width}.png`), fullPage: true });
    await page.getByRole("tab", { name: "浏览记录" }).click();
    const records = page.locator(".audit-analytics-panel");
    await expect(records).toBeVisible();
    await expect(records.getByText("用于验证长名称完整换行的虚构资料资料资料")).toBeVisible();
    const analyticsRowHeight = await records.locator("tbody tr").first().evaluate((row) => row.getBoundingClientRect().height);
    expect(analyticsRowHeight).toBeGreaterThanOrEqual(48);
    await page.screenshot({ path: testInfo.outputPath(`audit-browsing-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(requestLog.every((item) => item.method === "GET")).toBe(true);

    const baselineAdminUrl = process.env.TEST_BASELINE_ADMIN_URL;
    if (width === 1440 && baselineAdminUrl) {
      const baseline = new URL(baselineAdminUrl);
      expect(baseline.protocol).toBe("http:");
      expect(["127.0.0.1", "localhost", "[::1]"], "baseline must use an exact loopback origin").toContain(baseline.hostname);
      expect(baseline.username + baseline.password).toBe("");
      expect(baseline.pathname).toBe("/");
      expect(baseline.search + baseline.hash).toBe("");

      await page.goto(baseline.origin);
      await page.getByRole("button", { name: "操作记录", exact: false }).first().click();
      await expect(page.getByRole("tab", { name: "操作记录" })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("before-audit-operations-1440.png"), fullPage: true });
      await page.getByRole("tab", { name: "浏览记录" }).click();
      await expect(page.locator(".analytics-panel")).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("before-audit-browsing-1440.png"), fullPage: true });
      expect(requestLog.every((item) => item.method === "GET")).toBe(true);
    }
  });
}

test("audit filters and cursors use GET-only fictional fixtures; empty and error states remain visible", async ({ page }) => {
  await mockAdmin(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "操作记录", exact: false }).first().click();
  const operations = page.locator(".audit-operations");
  await operations.getByLabel("产品编号").fill("ZJ-DEMO");
  await operations.getByLabel("操作").selectOption("SAVE");
  await operations.getByRole("button", { name: "筛选记录" }).click();
  await expect.poll(() => requestLog.some((item) => {
    const url = new URL(item.url);
    return item.path.endsWith("/admin/audit-events") && url.searchParams.get("productId") === "ZJ-DEMO" && url.searchParams.get("action") === "SAVE";
  })).toBe(true);
  await operations.getByRole("button", { name: "加载更多记录" }).click();
  await expect(operations.locator("tbody tr")).toHaveCount(2);
  await expect.poll(() => requestLog.some((item) => item.path.endsWith("/admin/audit-events") && new URL(item.url).searchParams.get("cursor") === "audit-next")).toBe(true);
  await operations.getByLabel("产品编号").fill("fixture-empty");
  await operations.getByRole("button", { name: "筛选记录" }).click();
  await expect(operations.locator("tbody tr")).toHaveCount(0);
  await expect(operations.getByText("当前会话尚无对应操作记录。")).toBeVisible();
  await operations.getByLabel("产品编号").fill("fixture-error");
  await operations.getByRole("button", { name: "筛选记录" }).click();
  await expect(page.getByRole("alert")).toContainText("虚构读取错误");
  await page.getByRole("tab", { name: "浏览记录" }).click();
  const records = page.locator(".audit-analytics-panel");
  await records.getByLabel("统计事件类型").selectOption("VIEW");
  await records.getByLabel("统计使用端").selectOption("H5");
  await records.getByLabel("开始日期").fill("2026-10-01");
  await records.getByLabel("结束日期").fill("2026-10-29");
  await records.getByLabel("统计资料或产品搜索").fill("fixture-normal");
  await records.getByRole("button", { name: "查询" }).click();
  await expect.poll(() => requestLog.some((item) => {
    const url = new URL(item.url);
    return item.path.endsWith("/admin/analytics/events") && url.searchParams.get("q") === "fixture-normal" && url.searchParams.get("kind") === "VIEW" && url.searchParams.get("client") === "H5" && url.searchParams.get("from") === "2026-10-01" && url.searchParams.get("to") === "2026-10-29";
  })).toBe(true);
  await records.getByRole("button", { name: "加载更多记录" }).click();
  await expect.poll(() => requestLog.some((item) => item.path.endsWith("/admin/analytics/events") && new URL(item.url).searchParams.get("cursor") === "analytics-next")).toBe(true);
  await records.getByRole("button", { name: "重置" }).click();
  await expect(records.getByLabel("统计资料或产品搜索")).toHaveValue("");
  await expect.poll(() => requestLog.some((item) => item.path.endsWith("/admin/analytics/events") && new URL(item.url).searchParams.get("q") === null && new URL(item.url).searchParams.get("kind") === null)).toBe(true);
  await records.getByRole("button", { name: "刷新" }).click();
  await expect(records.locator("tbody tr")).toHaveCount(1);
  await records.getByLabel("统计资料或产品搜索").fill("fixture-empty");
  await records.getByRole("button", { name: "查询" }).click();
  await expect(records.getByText("没有符合条件的浏览或下载记录")).toBeVisible();
  await records.getByLabel("统计资料或产品搜索").fill("fixture-error");
  await records.getByRole("button", { name: "查询" }).click();
  await expect(records.getByRole("alert")).toContainText("虚构读取错误");
  await records.getByRole("button", { name: "重新读取" }).click();
  await expect(records.getByRole("alert")).toBeVisible();
  expect(requestLog.every((item) => item.method === "GET")).toBe(true);
});

test("content managers retain operations access without the admin-only browsing tab", async ({ page }) => {
  await mockAdmin(page, "CONTENT_MANAGER");
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "操作记录", exact: false }).first().click();
  await expect(page.locator(".audit-operations")).toBeVisible();
  await expect(page.getByRole("tab", { name: "浏览记录" })).toHaveCount(0);
  expect(requestLog.every((item) => item.method === "GET")).toBe(true);
});

test("unauthenticated users receive 401 and remain behind the re-login dialog without audit rows or tabs", async ({ page }) => {
  await mockAdmin(page, "UNAUTHENTICATED");
  await page.goto(urls.admin);
  const dialog = page.getByRole("dialog", { name: "重新登录" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("当前本地模拟身份不可用，请由管理员恢复后重试。")).toBeVisible();
  await expect(page.locator(".audit-operations tbody tr")).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "记录类型" })).toHaveCount(0);
  await expect(page.getByText("ZJ-DEMO-028-超长虚构编号-用于验证完整显示")).toHaveCount(0);
  expect(requestLog.some((item) => item.path.endsWith("/admin/me"))).toBe(true);

  const meRequestsBeforeRetry = requestLog.filter((item) => item.path.endsWith("/admin/me")).length;
  await dialog.getByRole("button", { name: "重新连接" }).click();
  await expect.poll(() => requestLog.filter((item) => item.path.endsWith("/admin/me")).length).toBeGreaterThan(meRequestsBeforeRetry);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("未登录");
  await expect(page.locator(".audit-operations tbody tr")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "浏览记录" })).toHaveCount(0);
  expect(requestLog.every((item) => item.method === "GET")).toBe(true);
});
