import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { Responses } from "@zj/contracts";
import { test, expect, urls } from "./support";

const logoPath = "/static/h5/brand/zhongji-security-logo.png";
const logoHash = "805c27ec4ebba01b37351f7071d7a00eb32fabda75c31e844ba88fbda7463c3c";
const productId = "3bbec595-ef31-4d60-aaca-7c1ed66a6074";
const product: Responses["PublicProductSummary"] = {
  productId, releaseId: "branding-release", releaseSequence: 1,
  publishedAt: "2026-10-29T00:00:00.000Z", name: "【品牌验收】隔离资料展示产品",
  categoryId: "miding", categoryName: "密鼎系列", tagline: "仅验证本地页面品牌展示，不写入 UAT 数据。",
  coverPath: null, pilotOrder: 1,
};
const material: Responses["PublicMaterial"] = {
  materialId: "branding-images", versionId: "branding-images-v1", name: "品牌验收图集",
  kind: "presentation", versionLabel: "V1.0", applicableVersion: null,
  previewKind: "images", pageCount: 1, publishedAt: product.publishedAt, previewPath: "",
};
const categories = [
  { id: "miding", name: "密鼎系列", shortName: "密鼎", sortOrder: 1, productCount: 1 },
  { id: "miyi", name: "密翼系列", shortName: "密翼", sortOrder: 2, productCount: 0 },
  { id: "mishu", name: "密塾系列", shortName: "密塾", sortOrder: 3, productCount: 0 },
  { id: "ai", name: "AI+人工智能应用", shortName: "AI+", sortOrder: 4, productCount: 0 },
];

test.beforeAll(() => {
  // The URL remains configurable; do not make the test depend on a temporary port.
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(new URL(urls.h5).hostname);
});

async function brandingFixture(page: Page) {
  const requested: URL[] = [];
  const png = await readFile("tests/fixtures/validation/page-1.png");
  await page.route("**/api/v1/**", async route => {
    expect(route.request().method(), "branding fixtures must never mutate API data").toBe("GET");
    const url = new URL(route.request().url());
    requested.push(url);
    const reply = (data: unknown) => route.fulfill({ json: { data, requestId: "branding-readonly-fixture" } });
    if (url.pathname === "/api/v1/catalog/categories") return reply(categories);
    if (url.pathname === "/api/v1/catalog/site-banner/default-image") return route.fulfill({ contentType: "image/png", path: "services/domain/assets/default-banner.png" });
    if (url.pathname === "/api/v1/catalog/site-banner") return reply({ version: 1, imageData: null, link: null, items: [{ id: "default", isDefault: true, imagePath: "/api/v1/catalog/site-banner/default-image", imageData: null, link: null, startsAt: null, endsAt: null }], introduction: "", introLink: null, refreshAfterSeconds: 30 });
    if (url.pathname === "/api/v1/catalog/site-contact") return reply({ version: 1, officialQr: null, serviceQr: null, phone: "400-685-0800" });
    if (url.pathname === "/api/v1/catalog/analytics") return reply({ viewEnabled: false, notice: "" });
    if (url.pathname === "/api/v1/catalog/products" || url.pathname === "/api/v1/catalog/materials") {
      const data = url.pathname.endsWith("/products") ? [product] : [{ productId, productName: product.name, categoryId: "miding", material }];
      return route.fulfill({ json: { data, page: { nextCursor: null }, requestId: "branding-readonly-fixture" } });
    }
    if (url.pathname === "/api/v1/catalog/products/" + productId + "/materials/branding-images/preview") return reply({
      productId, materialId: material.materialId, releaseId: product.releaseId, versionId: material.versionId,
      name: material.name, versionLabel: material.versionLabel, previewKind: "images", pageCount: 1,
      parts: [{ part: "page-1", pageIndex: 1, mimeType: "image/png", path: "/api/v1/catalog/branding-fixture/page-1.png" }],
    });
    if (url.pathname === "/api/v1/catalog/branding-fixture/page-1.png") return route.fulfill({ contentType: "image/png", body: png });
    return route.fulfill({ status: 404, json: { error: { code: "FIXTURE_NOT_FOUND", message: "未定义的只读品牌验证接口" } } });
  });
  return requested;
}

async function checkBrand(page: Page, viewportWidth: number) {
  if (await page.locator('.v2-kind-home').count() === 0) {
    await expect(page.locator('.v2-page-title')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    return;
  }
  const header = page.locator(".v2-brand-row"), logo = header.locator(".brand-logo"), image = logo.locator("img");
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAccessibleName("中技安全");
  await expect(logo).toHaveAttribute("role", "img");
  await expect(logo.locator("div").first()).toHaveCSS("background-size", "contain");
  await expect(image).toHaveAttribute("src", new RegExp(logoPath + "$"));
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(2172);
  const dimensions = await image.evaluate(async node => {
    const image = node as HTMLImageElement;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, complete: image.complete };
  });
  expect(dimensions).toEqual({ width: 2172, height: 724, complete: true });
  await expect(header.locator(".brand-title, .brand-badge")).toHaveCount(0);
  await expect(header).toHaveText("本地演示");
  const badge = header.locator(".v2-demo");
  await expect(badge).toBeVisible();
  const [logoBox, badgeBox, searchBox] = await Promise.all([logo.boundingBox(), badge.boundingBox(), page.locator(".search").boundingBox()]);
  expect(logoBox!.width).toBe(126);
  expect(logoBox!.height).toBe(42);
  expect(logoBox!.width / logoBox!.height).toBe(3);
  expect(badgeBox!.x).toBeGreaterThanOrEqual(logoBox!.x + logoBox!.width + 8);
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(viewportWidth - 15);
  expect(badgeBox!.y).toBeGreaterThanOrEqual(logoBox!.y);
  expect(badgeBox!.y + badgeBox!.height).toBeLessThanOrEqual(logoBox!.y + logoBox!.height);
  expect(searchBox!.y).toBeGreaterThanOrEqual(logoBox!.y + logoBox!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

for (const width of [375, 390, 414, 430]) {
  test(`H5 company logo keeps three catalog headers, search and navigation usable at ${width}px`, async ({ page }, testInfo) => {
    const requests = await brandingFixture(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto(urls.h5);
    await checkBrand(page, width);
    // Verify the served asset, not only a matching filename or DOM element.
    const logoResponse = await page.request.get(urls.h5 + logoPath);
    expect(logoResponse.ok()).toBe(true);
    expect(createHash("sha256").update(await logoResponse.body()).digest("hex")).toBe(logoHash);
    await expect(page.getByAltText("中技安全产品资料库品牌 Banner", {exact:true})).toBeVisible();
    await expect(page.locator(".series-card")).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath(`home-brand-${width}.png`), fullPage: true });

    await page.locator(".search input").fill("品牌验收");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page).toHaveURL(/pages\/products\/index/);
    await expect(page.locator(".search input")).toHaveValue("品牌验收");
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expect.poll(() => requests.some(url => url.pathname.endsWith("/catalog/products") && url.searchParams.get("q") === "品牌验收")).toBe(true);
    await checkBrand(page, width);
    await expect(page.locator(".v2-page-header")).toContainText("产品一览");
    await page.screenshot({ path: testInfo.outputPath(`products-brand-${width}.png`), fullPage: true });

    await page.locator(".v2-bottom-nav").getByText("资料", { exact: true }).click();
    await expect(page).toHaveURL(/pages\/materials\/index/);
    await expect(page.locator(".material-card")).toHaveCount(1);
    await checkBrand(page, width);
    await expect(page.locator(".v2-page-header")).toContainText("资料中心");
    await page.locator(".search input").fill("品牌验收图集");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect.poll(() => requests.some(url => url.pathname.endsWith("/catalog/materials") && url.searchParams.get("q") === "品牌验收图集")).toBe(true);
    await expect(page.locator(".material-card .published-title")).toHaveText(material.name);
    await page.screenshot({ path: testInfo.outputPath(`materials-brand-${width}.png`), fullPage: true });

    if (width === 390) {
      await page.locator(".preview-button").click();
      const preview = page.locator("#preview-surface img");
      await expect(preview).toBeVisible();
      expect(await preview.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.getByRole("button", {name:"返回上一页",exact:true}).click();
      await expect(page.locator(".search input")).toHaveValue("品牌验收图集");
      await checkBrand(page, width);
    }
    await page.locator(".v2-bottom-nav").getByText("首页", { exact: true }).click();
    // Uni's first page is canonically aliased to #/ when returning via the tab bar.
    await expect(page).toHaveURL(/#\/(?:pages\/home\/index)?$/);
    await expect(page.getByAltText("中技安全产品资料库品牌 Banner", {exact:true})).toBeVisible();
    await checkBrand(page, width);
  });
}
