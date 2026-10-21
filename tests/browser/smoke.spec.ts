import { test, expect, urls, json } from "./support";
test("portal catalogue hides drafts and handles no search results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(urls.portal + "/products");
  await expect(
    page.getByRole("heading", { name: "【Demo】资料问答助手" }),
  ).toBeVisible();
  await expect(page.getByText("保密工作管理系统")).toHaveCount(0);
  await page
    .getByRole("link", { name: "资料中心", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "资料中心", exact: true }),
  ).toBeVisible();
  await page.getByLabel("搜索资料").fill("不存在的测试资料-0909");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "没有找到相关内容" }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/round04/smoke-portal.png",
    fullPage: true,
  });
});
test("admin pages through seeded products, filters, opens an original draft and templates", async ({
  page,
  request,
}) => {
  const count = (await json(request, "/admin/products?limit=100")).body.data
    .length;
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto("http://127.0.0.1:3301");
  await expect(page.getByText("已加载 20 款")).toBeVisible();
  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.getByText("已加载 " + count + " 款")).toBeVisible();
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: /保密工作管理系统/ }),
  ).toBeVisible();
  await expect(page.getByLabel("部署说明", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "← 返回产品管理" }).click();
  await page.getByRole("textbox", { name: "搜索产品" }).fill("智能文档");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByText("已加载 1 款")).toBeVisible();
  await page.getByRole("textbox", { name: "搜索产品" }).fill("");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.getByText("已加载 20 款")).toBeVisible();
  await page.screenshot({
    path: "work/round04/smoke-admin.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "分类与模板", exact: false }).click();
  await page.getByRole("button", { name: /软件产品/ }).click();
  await expect(page.getByText("软件产品 · 内容结构")).toBeVisible();
});
for (const width of [390, 320])
  test(
    "H5 " + width + " empty-state and tab navigation without overflow",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route("**/api/v1/catalog/products*", (r) =>
        r.fulfill({
          json: {
            data: [],
            page: { nextCursor: null },
            requestId: "empty-test",
          },
        }),
      );
      await page.route("**/api/v1/catalog/materials*", (r) =>
        r.fulfill({
          json: {
            data: [],
            page: { nextCursor: null },
            requestId: "empty-test",
          },
        }),
      );
      await page.goto(urls.h5);
      await expect(page.getByText("产品资料正在整理")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.getByText("资料", { exact: true }).click();
      await expect(page.getByText("暂无发布内容")).toBeVisible();
      await page.screenshot({
        path: "work/round04/smoke-mobile-" + width + ".png",
        fullPage: true,
      });
    },
  );
test("H5 shows service failure rather than an empty catalogue", async ({
  page,
}) => {
  // Browser-only route failure cannot intercept server fetch; this checks the browser H5 path.
  await page.route("**/api/v1/catalog/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:3302");
  await expect(page.getByText("暂时无法连接", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("暂无发布内容")).toHaveCount(0);
});
test("built H5 preview cannot expose workspace files or accept foreign origins", async ({
  request,
}) => {
  for (const path of [
    "/README.md",
    "/.env",
    "/delivery/v4-rc2/README_先读.md",
    "/%2e%2e%2fpackage.json",
  ]) {
    expect((await request.get("http://127.0.0.1:3302" + path)).status()).toBe(
      404,
    );
  }
  expect(
    (
      await request.get("http://127.0.0.1:3302/", {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
});
