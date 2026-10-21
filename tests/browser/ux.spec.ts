import { test, expect, urls } from "./support";
import { readFile } from "node:fs/promises";
const name = "【Demo】资料问答助手";
const mobileProducts = "/#/pages/products/index";
const mobileMaterials = "/#/pages/materials/index";
const overflow = async (page: import("@playwright/test").Page) =>
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);

test("homepage branding and featured products never fall back to demo records", async ({
  page,
}) => {
  await page.goto(urls.portal);
  await expect(page).toHaveTitle("中技安全产品平台");
  await expect(
    page.getByRole("heading", { name: /中技于密.*安全于行/ }),
  ).toBeVisible();
  await expect(page.getByText("产品资料正在整理")).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await page.goto(urls.h5);
  await expect(
    page.getByText("中技于密，安全于行", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("产品资料正在整理")).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await page.getByText("浏览产品", { exact: true }).click();
  await expect(
    page.locator(".product-card").filter({ hasText: name }),
  ).toBeVisible();
});

test("PC explicit back keeps product filters through detail and PDF", async ({
  page,
}) => {
  await page.goto(
    urls.portal +
      "/products?q=" +
      encodeURIComponent("知识查询演示") +
      "&categoryId=ai",
  );
  await page.locator(".product-card").filter({ hasText: name }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page
    .locator(".material-row")
    .filter({ hasText: "资料问答助手 · 产品介绍" })
    .getByRole("link", { name: "预览", exact: true })
    .click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("link", { name: "← 返回上一页", exact: true }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("link", { name: "← 返回上一页", exact: true }).click();
  await expect(page.getByLabel("搜索产品")).toHaveValue("知识查询演示");
  await expect(page.locator(".chip.active")).toHaveText("AI+人工智能应用");
});

test("H5 home search, filter, preview and explicit return preserve input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(urls.h5);
  await page.locator(".search input").fill("资料问答");
  await page.locator(".search uni-button").filter({ hasText: "搜索" }).click();
  await expect(
    page.locator(".product-card").filter({ hasText: name }),
  ).toBeVisible();
  await page
    .locator(".category-row uni-button")
    .filter({ hasText: "AI+人工智能应用" })
    .click();
  await page.locator(".product-card").filter({ hasText: name }).click();
  await expect(page.locator(".no-cover")).toHaveCount(0);
  await page
    .locator(".material-card")
    .filter({ hasText: "资料问答助手 · 产品介绍" })
    .click();
  await expect(page.locator("#preview-surface canvas")).toBeVisible();
  await page.getByText("← 返回上一页", { exact: true }).click();
  await expect(page.locator(".detail-title")).toHaveText(name);
  await page.getByText("← 返回上一页", { exact: true }).click();
  await expect(page.locator(".search input")).toHaveValue("资料问答");
  await expect(page.locator(".category-row .selected")).toHaveText(
    "AI+人工智能应用",
  );
});

test("material links distinguish preview from owning product and retain source", async ({
  page,
}) => {
  await page.goto(
    urls.portal + "/materials?q=" + encodeURIComponent("分页图集"),
  );
  const row = page
    .locator(".material-row")
    .filter({ hasText: "资料问答助手 · 分页图集" });
  await row.getByRole("link", { name: "预览", exact: true }).click();
  await expect(page.getByAltText("资料第 1 页")).toBeVisible();
  await page.getByRole("link", { name: "← 返回上一页", exact: true }).click();
  await expect(page.getByLabel("搜索资料")).toHaveValue("分页图集");
  await row.getByRole("link", { name: /所属产品/ }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("link", { name: "← 返回上一页", exact: true }).click();
  await expect(page.getByLabel("搜索资料")).toHaveValue("分页图集");
  await page.goto(urls.h5 + mobileMaterials);
  await page.locator(".search input").fill("分页图集");
  await page.locator(".search uni-button").filter({ hasText: "搜索" }).click();
  await page.locator(".material-card .preview-button").click();
  await expect(page.locator("#preview-surface img")).toBeVisible();
  await page.getByText("← 返回上一页", { exact: true }).click();
  await expect(page.locator(".search input")).toHaveValue("分页图集");
  await page.locator(".product-link").click();
  await expect(page.locator(".detail-title")).toHaveText(name);
  await page.getByText("← 返回上一页", { exact: true }).click();
  await expect(page.locator(".search input")).toHaveValue("分页图集");
});

for (const width of [360, 375, 390, 430])
  test(
    "mobile reading layout and touch controls at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(urls.h5);
      await expect(
        page.getByText("浏览产品", { exact: true }),
      ).toBeInViewport();
      await overflow(page);
      await page.screenshot({
        path: "work/round04/ux-home-" + width + ".png",
        fullPage: true,
      });
      await page.getByText("浏览产品", { exact: true }).click();
      await expect(page.locator(".product-card").first()).toBeInViewport();
      await overflow(page);
      const size = await page
        .locator(".published-description")
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
      expect(
        (await page.locator(".category-row uni-button").first().boundingBox())!
          .height,
      ).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: "work/round04/ux-products-" + width + ".png",
        fullPage: true,
      });
      await page.locator(".product-card").filter({ hasText: name }).click();
      await expect(page.locator(".detail-title")).toBeVisible();
      await overflow(page);
      await page.screenshot({
        path: "work/round04/ux-detail-" + width + ".png",
        fullPage: true,
      });
    },
  );
for (const width of [1280, 1440])
  test(
    "PC product and material layout at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(urls.portal);
      await overflow(page);
      await page.screenshot({
        path: "work/round04/ux-pc-home-" + width + ".png",
        fullPage: true,
      });
      await page.getByRole("link", { name: "浏览产品", exact: true }).click();
      await expect(page.getByRole("heading", { name })).toBeInViewport();
      await overflow(page);
      await page.screenshot({
        path: "work/round04/ux-pc-products-" + width + ".png",
        fullPage: true,
      });
      await page.locator(".product-card").filter({ hasText: name }).click();
      await expect(page.getByRole("heading", { name })).toBeVisible();
      await overflow(page);
      await page.screenshot({
        path: "work/round04/ux-pc-detail-" + width + ".png",
        fullPage: true,
      });
    },
  );

for (const width of [375, 390])
  test(
    "first published pilot is found beyond initial page at " + width + "px",
    async ({ page }) => {
      const pilots = JSON.parse(
        await readFile("data/pilot-products.json", "utf8"),
      );
      const items = pilots
        .map((p: any) => ({
          ...p,
          releaseId: "layout-fixture",
          releaseSequence: 1,
          publishedAt: "2026-10-21T00:00:00Z",
          categoryName: "布局验证分类",
          tagline: "仅用于布局验证的占位说明",
          coverPath: null,
        }))
        .reverse();
      let later = false;
      await page.route("**/api/v1/catalog/products?*", async (route) => {
        const cursor = new URL(route.request().url()).searchParams.get(
          "cursor",
        );
        later ||= !!cursor;
        await route.fulfill({
          json: {
            data: cursor
              ? items
              : [
                  {
                    ...items[0],
                    productId: "TEST-DEMO",
                    pilotOrder: null,
                    name: "不应推荐的样例",
                  },
                ],
            page: { nextCursor: cursor ? null : "later" },
            requestId: "layout-only",
          },
        });
      });
      await page.setViewportSize({ width, height: 812 });
      await page.goto(urls.h5);
      await expect(page.locator(".product-card")).toHaveCount(6);
      expect(later).toBe(true);
      await expect(page.locator(".product-card").first()).toContainText(
        "保密工作管理系统",
      );
      await expect(
        page.locator(".product-card .published-title").first(),
      ).toBeInViewport();
      await expect(page.getByText("不应推荐的样例")).toHaveCount(0);
      await overflow(page);
      await page.screenshot({
        path: "work/round04/ux-pilot-fixture-" + width + ".png",
        fullPage: true,
      });
    },
  );

test("H5 failed product image degrades and absent sections have no dead anchors", async ({
  page,
  request,
}) => {
  const detail = (
    await (
      await request.get(urls.api + "/api/v1/catalog/products/ZJ-032")
    ).json()
  ).data;
  detail.media = [
    {
      mediaId: "broken",
      role: "screenshot",
      alt: "测试失败素材",
      path: "/api/v1/catalog/products/ZJ-032/media/broken",
    },
  ];
  detail.problemValues = [];
  await page.route("**/api/v1/catalog/products/ZJ-032", (r) =>
    r.fulfill({ json: { data: detail, requestId: "image-only" } }),
  );
  await page.route("**/media/broken", (r) => r.abort());
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(urls.h5 + "/#/pages/detail/index?id=ZJ-032");
  await expect(
    page.locator(".section-nav uni-button").filter({ hasText: "价值" }),
  ).toHaveCount(0);
  await expect(page.getByText("图片暂不可用")).toBeVisible();
  await expect(page.getByText("重试图片")).toBeVisible();
  await overflow(page);
  await page.screenshot({
    path: "work/round04/ux-image-error.png",
    fullPage: true,
  });
});

test("direct reader rejects external return destination and missing product recovers", async ({
  page,
}) => {
  await page.goto(
    urls.portal +
      "/viewer?productId=ZJ-032&materialId=demo-slides&from=" +
      encodeURIComponent("https://outside.example/"),
  );
  await expect(
    page.getByRole("link", { name: "← 返回上一页", exact: true }),
  ).toHaveAttribute("href", "/products/ZJ-032");
  await page.goto(urls.h5 + "/#/pages/detail/index");
  await expect(page.getByText("产品暂不可用", { exact: true })).toBeVisible();
  await page.locator(".back-link").click();
  await expect(page.getByText("产品中心", { exact: true })).toBeVisible();
});

test("explicit catalog return restores the scrolled reading position", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 512 });
  for (const kind of ["h5", "portal"] as const) {
    await page.goto(
      kind === "h5" ? urls.h5 + mobileProducts : urls.portal + "/products",
    );
    const card = page
      .locator(".product-card")
      .filter({ hasText: "【验证数据】软件制作示例" });
    await card.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => scrollY);
    expect(y).toBeGreaterThan(50);
    await card.click();
    await expect(
      page.getByText("【验证数据】软件制作示例", { exact: true }),
    ).toBeVisible();
    await page.getByText("← 返回上一页", { exact: true }).click();
    await expect(card).toBeInViewport();
    await expect
      .poll(async () => Math.abs((await page.evaluate(() => scrollY)) - y))
      .toBeLessThan(12);
  }
});
