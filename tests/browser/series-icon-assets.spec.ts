import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Locator, Page } from "@playwright/test";
import type { Responses } from "@zj/contracts";
import { test, expect, urls, loginSales, json } from "./support";

const series = [
  { id: "miding", name: "密鼎·保密应用产品系列", shortName: "密鼎", sha256: "c2b9ad960db5570410289d3e71415302e50f8e90ca6ada672a4f683471c91f14" },
  { id: "miyi", name: "密翼·移动终端安全产品", shortName: "密翼", sha256: "1f62c2bf90b3bff85b2a024f16cc2bead00a5234d84af3300f8a20f8734e9599" },
  { id: "mishu", name: "密塾·保密教育产品系列", shortName: "密塾", sha256: "35fcca13e3a793cd5573cbdb62b2efff145fcbaf535680099c6ae6583e7513a4" },
  { id: "ai", name: "AI+人工智能应用", shortName: "AI+", sha256: "a6ac04915c3fefcf062f858d2fea983660fa14e776c0ca221cee687576edfe65" },
] as const;

test.beforeAll(async ({ request }) => {
  // Keep ports configurable for later local runs, while refusing cloud targets.
  // The runner selects an isolated session through TEST_*_URL.
  for (const [name, value] of Object.entries(urls)) {
    const url = new URL(value);
    expect(url.protocol, name + " must use local HTTP").toBe("http:");
    expect(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), name + " must be loopback").toBe(true);
  }
  const health = await request.get(urls.api + "/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).provider, "icon verification requires a local mock provider").toBe("mock");
});

async function decodedImage(image: Locator, width = 1024) {
  await expect(image).toHaveCount(1);
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(width);
  const dimensions = await image.evaluate(async node => {
    const image = node as HTMLImageElement;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, complete: image.complete };
  });
  expect(dimensions.complete).toBe(true);
  if (width === 1024) expect(dimensions.height).toBe(1024);
}

const products: Responses["PublicProductSummary"][] = series.map((item, index) => ({
  productId: "icon-" + item.id, releaseId: "icon-release-" + item.id, releaseSequence: 1,
  publishedAt: "2026-10-28T08:00:00.000Z", name: "【图标】" + item.shortName,
  categoryId: item.id, categoryName: item.name, tagline: "只读虚构展示，不写入 UAT 数据。",
  coverPath: null, pilotOrder: index + 1,
}));
products.push(
  { ...products[0], productId: "icon-cover", name: "【图标】专属封面优先", coverPath: "/api/v1/catalog/icon-fixture/cover.png" },
  { ...products[1], productId: "icon-broken", name: "【图标】封面失败回退", coverPath: "/api/v1/catalog/icon-fixture/broken.png" },
  { ...products[0], productId: "icon-unknown", name: "【图标】未知分类", categoryId: "unknown", categoryName: "未知分类" },
);

async function mobileFixture(page: Page) {
  const cover = await readFile("tests/fixtures/validation/page-1.png");
  await page.route("**/api/v1/**", async route => {
    expect(route.request().method(), "icon fixtures are GET-only").toBe("GET");
    const url = new URL(route.request().url());
    const reply = (data: unknown) => route.fulfill({ json: { data, requestId: "series-icon-readonly" } });
    if (url.pathname === "/api/v1/catalog/categories") return reply(series.map((item, index) => ({
      id: item.id, name: item.name, shortName: item.shortName, sortOrder: index + 1, productCount: index + 1,
    })));
    if (url.pathname === "/api/v1/catalog/products") {
      const category = url.searchParams.get("categoryId");
      const data = category ? products.filter(item => item.categoryId === category) : products;
      return route.fulfill({ json: { data, page: { nextCursor: null }, requestId: "series-icon-readonly" } });
    }
    if (url.pathname === "/api/v1/catalog/site-banner") return reply({ version: 1, imageData: null, link: null, introduction: "", introLink: null, refreshAfterSeconds: 30 });
    if (url.pathname === "/api/v1/catalog/site-contact") return reply({ version: 1, officialQr: null, serviceQr: null, phone: "400-685-0800" });
    if (url.pathname === "/api/v1/catalog/analytics") return reply({ viewEnabled: false, notice: "" });
    if (url.pathname === "/api/v1/catalog/icon-fixture/cover.png") return route.fulfill({ contentType: "image/png", body: cover });
    return route.fulfill({ status: 404, json: { error: { code: "ICON_FIXTURE_NOT_FOUND", message: "未定义的只读图标验证资源" } } });
  });
}

async function homeFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const selector of [".series-card", ".series-name", ".series-meta"]) {
    for (const node of await page.locator(selector).all()) {
      expect(await node.evaluate(element => element.scrollWidth <= element.clientWidth + 1), selector + " must retain full content without horizontal clipping").toBe(true);
    }
  }
}

test("all twelve series PNG assets preserve approved source hashes, dimensions and RGBA", async () => {
  for (const directory of ["apps/mobile/src/static/series", "apps/portal/public/series", "apps/admin/public/series"]) {
    for (const item of series) {
      const path = `${directory}/${item.id}.png`;
      const bytes = await readFile(path);
      expect(createHash("sha256").update(bytes).digest("hex"), path).toBe(item.sha256);
      expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), path).toBe(true);
      expect(bytes.toString("ascii", 12, 16), path).toBe("IHDR");
      expect(bytes.readUInt32BE(16), path).toBe(1024);
      expect(bytes.readUInt32BE(20), path).toBe(1024);
      expect(bytes[24], path + " bit depth").toBe(8);
      expect(bytes[25], path + " RGBA color type").toBe(6);
    }
  }
});

for (const width of [375, 390, 414, 430]) {
  test(`H5 series home icons decode and category navigation remains usable at ${width}px`, async ({ page }, testInfo) => {
    await mobileFixture(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(urls.h5 + "/#/pages/home/index");
    await expect(page.locator(".series-card")).toHaveCount(4);
    await expect(page.locator(".v2-series-name")).toHaveText(series.map(item => item.shortName));
    for (const item of series) {
      const card = page.locator(".series-card").filter({ hasText: item.shortName });
      await expect(card).toHaveAttribute("aria-label", `${item.shortName}，${series.indexOf(item) + 1} 款产品，查看系列`);
      const image = card.locator("img");
      await expect(image).toHaveAttribute("src", `/static/h5/series/${item.id}.svg`);
      await decodedImage(image, 384);
    }
    await homeFits(page);
    await page.screenshot({ path: testInfo.outputPath(`series-home-${width}.png`), fullPage: true });
    for (const item of series) {
      await page.locator(".series-card").filter({ hasText: item.shortName }).click();
      await expect(page).toHaveURL(/pages\/products\/index/);
      await expect(page.locator(".v2-hero-name")).toHaveText(item.shortName);
      await expect(page.locator(".product-card").filter({ hasText: "【图标】" + item.shortName })).toBeVisible();
      await page.goto(urls.h5 + "/#/pages/home/index");
      await expect(page.locator(".series-card")).toHaveCount(4);
    }
  });
}

test("H5 product cards retain four series fallbacks, custom cover priority, failure fallback and generic placeholder", async ({ page }, testInfo) => {
  await mobileFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(urls.h5 + "/#/pages/products/index");
  await expect(page.locator(".product-card")).toHaveCount(7);
  for (const item of series) {
    const card = page.locator(".product-card").filter({ hasText: "【图标】" + item.shortName });
    const image = card.locator(".series-icon img");
    await expect(image).toHaveAttribute("src", `/static/series/${item.id}.png`);
    await decodedImage(image);
  }
  const cover = page.locator(".product-card").filter({ hasText: "【图标】专属封面优先" });
  await cover.scrollIntoViewIfNeeded();
  await expect(cover.locator(".series-icon")).toHaveCount(0);
  await expect(cover.locator("img")).toHaveAttribute("src", /\/api\/v1\/catalog\/icon-fixture\/cover\.png$/);
  await expect.poll(() => cover.locator("img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await cover.locator("img").evaluate(node => (node as HTMLImageElement).decode());
  const broken = page.locator(".product-card").filter({ hasText: "【图标】封面失败回退" });
  await broken.scrollIntoViewIfNeeded();
  await expect(broken.locator(".product-visual")).toHaveClass(/failed/);
  await expect(broken.locator(".series-icon img")).toHaveAttribute("src", "/static/series/miyi.png");
  await decodedImage(broken.locator(".series-icon img"));
  const unknown = page.locator(".product-card").filter({ hasText: "【图标】未知分类" });
  await expect(unknown.locator(".visual-symbol")).toBeVisible();
  await expect(unknown.locator("img")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("series-product-fallbacks.png"), fullPage: true });
});

test("sales PC decodes four home series PNGs and the existing Demo product fallback", async ({ page }, testInfo) => {
  await loginSales(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(urls.portal);
  for (const item of series) {
    const card = page.locator(`.family-grid a[href="/products?categoryId=${item.id}"]`);
    await expect(card).toBeVisible();
    const image = card.locator("img");
    await expect(image).toHaveAttribute("src", `/series/${item.id}.png`);
    await decodedImage(image);
  }
  await page.screenshot({ path: testInfo.outputPath("series-pc-home.png"), fullPage: true });
  await page.locator('.family-grid a[href="/products?categoryId=ai"]').click();
  await expect(page).toHaveURL(/\/products\?categoryId=ai/);
  await page.goto(urls.portal + "/products?q=" + encodeURIComponent("【Demo】资料问答助手"));
  const image = page.locator(".product-card").filter({ hasText: "【Demo】资料问答助手" }).locator(".series-icon");
  await expect(image).toHaveAttribute("src", "/series/ai.png");
  await decodedImage(image);
});

test("admin wizard switches all four PNGs and cancellation creates no product", async ({ page }, testInfo) => {
  const before = await json(page.request, "/admin/products?limit=100");
  expect(before.status).toBe(200);
  const ids = (data: { productId: string }[]) => data.map(item => item.productId).sort();
  const mutationAttempts: string[] = [];
  await page.route("**/api/v1/admin/**", async route => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      mutationAttempts.push(route.request().method() + " " + new URL(route.request().url()).pathname);
      return route.fulfill({ status: 403, body: "Icon verification does not permit admin writes" });
    }
    return route.fallback();
  });
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "新增产品", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增产品" });
  for (const item of series) {
    await dialog.getByRole("combobox", { name: "产品分类" }).selectOption(item.id);
    const image = dialog.locator(".series-selection-icon img");
    await expect(image).toHaveAttribute("src", `/series/${item.id}.png`);
    await expect(dialog.locator(".series-selection-icon")).toContainText(item.shortName);
    await decodedImage(image);
  }
  await page.screenshot({ path: testInfo.outputPath("series-admin-wizard.png"), fullPage: true });
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const after = await json(page.request, "/admin/products?limit=100");
  expect(after.status).toBe(200);
  expect(ids(after.body.data)).toEqual(ids(before.body.data));
  expect(mutationAttempts).toEqual([]);
});
