import { test, expect, urls, loginSales } from "./support";

test("PC home, catalog, detail and viewer reject anonymous access, including former public proxies", async ({ page, request }) => {
  for (const path of ["/", "/products", "/materials", "/products/00000000-0000-0000-0000-000000000000", "/viewer?productId=one&materialId=two"]) {
    await page.goto(urls.portal + path);
    await expect(page.getByRole("heading", { name: "销售账号登录" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/sales");
    await expect(page.getByText("【Demo】资料问答助手", { exact: true })).toHaveCount(0);
  }
  for (const path of ["/api/sales/catalog/products", "/api/catalog/products", "/api/catalog/materials", "/api/catalog/categories"]) {
    expect((await request.get(urls.portal + path)).status()).toBe(401);
    expect((await request.get(urls.portal + path, { headers: { Authorization: "Bearer local-sales" } })).status()).toBe(401);
  }
});

test("sales login keeps an HttpOnly session, searches aliases, previews and downloads streamed resources", async ({ page }) => {
  const resourceUrls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/")) resourceUrls.push(request.url()); });
  await page.goto(urls.portal + "/products?q=" + encodeURIComponent("知识查询演示"));
  await page.getByRole("button", { name: "进入本地销售验证" }).click();
  await expect(page.getByRole("heading", { name: "产品中心", exact: true })).toBeVisible();
  await expect(page.getByLabel("搜索产品")).toHaveValue("知识查询演示");
  const cookie = (await page.context().cookies()).find((item) => item.name === "zj-sales");
  expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Strict"); expect(cookie?.value).not.toContain("local-sales");
  expect(await page.evaluate(() => document.cookie)).not.toContain("zj-sales");
  await page.getByLabel("更新开始日期").fill("2099-01-01");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByRole("heading", { name: "没有找到相关内容" })).toBeVisible();
  await page.getByRole("link", { name: "重置", exact: true }).click();
  await expect(page.getByLabel("更新开始日期")).toHaveValue("");
  await page.getByLabel("搜索产品").fill("知识查询演示");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.locator(".product-card").filter({ hasText: "【Demo】资料问答助手" }).click();
  await expect(page.getByRole("heading", { name: "【Demo】资料问答助手" })).toBeVisible();
  await page.locator(".material-row").filter({ hasText: "资料问答助手 · 产品介绍" }).getByRole("link", { name: "预览", exact: true }).click();
  await expect(page.locator("canvas")).toBeVisible();
  const link = page.getByRole("link", { name: "下载资料", exact: true });
  const href = await link.getAttribute("href"); expect(href).toMatch(/^\/api\/sales\//); expect(href).not.toContain("token");
  const ranged = await page.request.get(urls.portal + href, { headers: { Range: "bytes=0-3" } });
  expect(ranged.status()).toBe(206); expect((await ranged.body()).toString()).toBe("%PDF");
  const download = page.waitForEvent("download"); await link.click(); expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "销售账号登录" })).toBeVisible();
  expect((await page.request.get(urls.portal + href)).status()).toBe(401);
  await page.goBack(); await expect(page.getByRole("heading", { name: "销售账号登录" })).toBeVisible();
  expect(resourceUrls.every((url) => !/local-sales|access_token|Bearer/.test(url))).toBe(true);
});

test("PC session rejects cross-origin calls and real login failures do not enter the local session", async ({ page, request }) => {
  const hostile = await request.post(urls.portal + "/api/sales/session", { headers: { Origin: "https://outside.example" }, data: { localValidation: true } });
  expect(hostile.status()).toBe(403);
  await page.goto(urls.portal + "/sales?returnTo=" + encodeURIComponent("https://outside.example"));
  await page.getByLabel("账号", { exact: true }).fill("fictional-unconfigured-account");
  await page.getByLabel("密码", { exact: true }).fill("fictional-form-validation");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".sales-message[role=alert]")).toHaveText("身份服务尚未配置，请联系管理员");
  await expect(page.getByRole("heading", { name: "销售账号登录" })).toBeVisible();
  expect((await page.context().cookies()).some((item) => item.name === "zj-sales")).toBe(false);
  await loginSales(page);
  expect((await page.request.get(urls.portal + "/api/sales/catalog/products", { headers: { Origin: "https://outside.example", "Sec-Fetch-Site": "cross-site" } })).status()).toBe(403);
});


test("administrator can explicitly bind a sales role without changing other accounts", async ({ page }) => {
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  const existing = page.locator("tbody tr").filter({ hasText: "本地模拟管理员" });
  await expect(existing.getByText("管理员", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增账号", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增后台账号" });
  const name = "【测试】销售绑定 " + Date.now();
  await dialog.getByLabel("身份主体", { exact: false }).fill("test-sales-subject-" + Date.now());
  await dialog.getByLabel("显示名称", { exact: true }).fill(name);
  await dialog.getByLabel("角色", { exact: true }).selectOption("SALES");
  await expect(dialog.getByText("销售身份仅可登录销售工作台，不具备管理后台权限。")).toBeVisible();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator("tbody tr").filter({ hasText: name }).getByText("销售", { exact: true })).toBeVisible();
  await expect(existing.getByText("管理员", { exact: true })).toBeVisible();
});
