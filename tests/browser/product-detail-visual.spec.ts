import { readFile } from "node:fs/promises";
import type { Page, Route } from "@playwright/test";
import type { Responses } from "@zj/contracts";
import { test, expect, urls } from "./support";

// All API responses in this file are request-scoped fixtures: no admin writes,
// seed/reset calls, or dependence on the user's running UAT session.
const productId = "1e3ee6e0-4b63-4f31-9ed9-7a4dac8cec99";
const product: Responses["PublicProduct"] = {
  productId, releaseId: "visual-fixture-release", releaseSequence: 1,
  publishedAt: "2026-10-28T08:00:00.000Z",
  name: "【视觉验证】移动端产品资料样例", model: "UAT-VISUAL-2026",
  category: { id: "miding", name: "密鼎系列" },
  tagline: "仅供本地验收的虚构介绍，不作为正式产品参数。",
  summary: "第一段  保留原有空格与文字。\n\n第二段介绍保持自然换行。",
  audiences: "隔离 UAT 验收人员",
  problemValues: [{ id: "value", title: "资料查找", text: "集中展示虚构资料，便于核对内容是否完整。" }],
  features: [
    { id: "feature", title: "资料快速定位", text: "点按能力标签，阅读完整说明后关闭弹窗。" },
    { id: "long-feature", title: "包含长标题与完整标识LONG-CAPABILITY-ABCDEFGHIJKLMNOPQRSTUVWXYZ的能力标签", text: "长能力名称应换行并保留完整点击区域。" },
  ],
  scenarios: [{ id: "scene", title: "移动阅读", text: "在手机视口检查段落、章节与资料入口。" }],
  technical: { inputs: "本地虚构样例", humanReview: "仅验证展示，不代表生产验收。" },
  media: [{ mediaId: "screen", role: "screenshot", alt: "本地样例展示图", path: "/api/v1/catalog/visual-fixture/screenshot.png" }],
  materials: [
    { materialId: "images", versionId: "images-v2", name: "视觉验收分页图集", kind: "presentation", versionLabel: "V2.3", applicableVersion: null, previewKind: "images", pageCount: 2, publishedAt: "2026-10-28T08:00:00.000Z", previewPath: "" },
    { materialId: "pdf", versionId: "pdf-v1", name: "视觉验收 PDF 介绍", kind: "brochure", versionLabel: "V1.2", applicableVersion: null, previewKind: "pdf", pageCount: 3, publishedAt: "2026-10-27T08:00:00.000Z", previewPath: "" },
    { materialId: "video", versionId: "video-v1", name: "视觉验收视频说明", kind: "other", versionLabel: "V1.0", applicableVersion: null, previewKind: "video", pageCount: 1, publishedAt: "2026-10-26T08:00:00.000Z", previewPath: "" },
  ],
};
const contact: Responses["SiteContact"] = { version: 1, officialQr: null, serviceQr: null, phone: "400-685-0800" };
const detailUrl = () => urls.h5 + "/#/pages/detail/index?id=" + productId;
type FixtureOptions = {
  product?: Responses["PublicProduct"];
  contact?: Responses["SiteContact"];
  detail?: (route: Route) => Promise<void>;
  brokenMedia?: () => boolean;
};

async function fixture(page: Page, options: FixtureOptions = {}) {
  const current = options.product ?? product;
  const png = await readFile("tests/fixtures/validation/page-1.png");
  await page.route("**/api/v1/**", async route => {
    // Fail safely rather than forwarding an unexpected request to any API.
    expect(route.request().method(), "visual tests must never mutate API data").toBe("GET");
    const pathname = new URL(route.request().url()).pathname;
    const reply = (data: unknown) => route.fulfill({ json: { data, requestId: "visual-fixture" } });
    if (pathname === "/api/v1/catalog/products/" + productId) {
      if (options.detail) return options.detail(route);
      return reply(current);
    }
    if (pathname === "/api/v1/catalog/site-contact") return reply(options.contact ?? contact);
    if (pathname === "/api/v1/catalog/site-banner") return reply({ version: 1, imageData: null, link: null, introduction: "", introLink: null, refreshAfterSeconds: 30 });
    if (pathname === "/api/v1/catalog/analytics") return reply({ viewEnabled: false, notice: "" });
    if (pathname === "/api/v1/catalog/categories") return reply([{ id: "miding", name: "密鼎系列", shortName: "密鼎", sortOrder: 1, productCount: 1 }]);
    if (pathname === "/api/v1/catalog/products") return route.fulfill({ json: {
      data: [{ productId, releaseId: current.releaseId, releaseSequence: 1, publishedAt: current.publishedAt, name: current.name, categoryId: "miding", categoryName: "密鼎系列", tagline: current.tagline, coverPath: null, pilotOrder: 1 }],
      page: { nextCursor: null }, requestId: "visual-fixture",
    } });
    if (pathname === "/api/v1/catalog/products/" + productId + "/materials/images/preview") return reply({
      productId, materialId: "images", releaseId: current.releaseId, versionId: "images-v2",
      name: "视觉验收分页图集", versionLabel: "V2.3", previewKind: "images", pageCount: 2,
      parts: [1, 2].map(pageIndex => ({ part: "page-" + pageIndex, pageIndex, mimeType: "image/png", path: "/api/v1/catalog/visual-fixture/page-" + pageIndex + ".png" })),
    });
    if (/^\/api\/v1\/catalog\/visual-fixture\/(screenshot|page-[12])\.png$/.test(pathname)) {
      if (pathname.endsWith("screenshot.png") && options.brokenMedia?.()) return route.fulfill({ status: 404, body: "fixture image unavailable" });
      return route.fulfill({ contentType: "image/png", body: png });
    }
    return route.fulfill({ status: 404, json: { error: { code: "FIXTURE_NOT_FOUND", message: "未定义的只读验证接口" } } });
  });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const selector of [".detail-intro", ".detail-title", ".detail-intro .paragraph", ".feature-tags", ".capability-tag", ".contact-phone"]) {
    for (const node of await page.locator(selector).all()) {
      expect(await node.evaluate(element => element.scrollWidth <= element.clientWidth + 1), selector + " must not clip long content").toBe(true);
    }
  }
}

for (const width of [375, 390, 414, 430]) {
  test(`detail visual layout preserves full long content and touch targets at ${width}px`, async ({ page }, testInfo) => {
    const long = {
      ...product,
      name: "【视觉验证】包含较长产品名称的移动端产品资料完整展示验收样例",
      model: "UAT-LONG-MODEL-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-2026",
    };
    await fixture(page, { product: long });
    await page.setViewportSize({ width, height: 844 });
    await page.goto(detailUrl());
    const detail = page.locator(".detail-page");
    await expect(page.locator(".detail-title")).toHaveText(long.name);
    await expect(page.locator(".detail-intro .paragraph")).toHaveText("产品型号：" + long.model);
    const expectedText = [
      long.category.name, long.name, long.model, long.tagline,
      "第一段  保留原有空格与文字。", "第二段介绍保持自然换行。", long.audiences,
      ...long.problemValues.flatMap(item => [item.title, item.text]),
      long.scenarios[0].title, long.scenarios[0].text, ...long.features.map(item => item.title),
      "本地样例展示图", "输入说明", long.technical.inputs, "人工复核与限制", long.technical.humanReview,
      ...long.materials.map(item => item.name), "官方公众号", "客服微信", "官方电话", contact.phone!,
    ];
    // Check each expected string independently: intervening labels and sections
    // are intentional, and multiple spaces in the original summary must survive.
    for (const value of expectedText) {
      await expect(detail).toContainText(value);
    }
    await expect(detail.locator(".section-title")).toHaveText([
      "产品介绍", "问题与价值", "应用场景", "核心能力", "产品展示", "技术与使用说明", "产品资料",
    ]);
    await expect(page.locator(".media-list .section-title")).toHaveCSS("font-size", "20px");
    await expect(page.locator(".media-list .section-title")).toHaveCSS("color", "rgb(22, 93, 255)");
    const paragraphs = page.locator(".product-introduction .summary");
    await expect(paragraphs).toHaveCount(2);
    expect(await paragraphs.first().textContent()).toBe("第一段  保留原有空格与文字。");
    for (const paragraph of await paragraphs.all()) {
      await expect(paragraph).toHaveCSS("font-size", "16px");
      await expect(paragraph).toHaveCSS("text-indent", "32px");
      await expect(paragraph).toHaveCSS("white-space", "pre-wrap");
    }
    await expect(page.locator(".section-nav uni-button")).toHaveText(["价值", "能力", "场景", "资料"]);
    const positions = await page.locator(".section-nav uni-button").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(1);
    for (const button of await page.locator(".view-materials, .section-nav uni-button, .capability-tag, .contact-phone uni-button").all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator(".material-meta")).toHaveText([
      "V2.3 · 图片 · 2 页 · 2026-10-28", "V1.2 · PDF · 3 页 · 2026-10-27", "V1.0 · 视频 · 2026-10-26",
    ]);
    await expect(page.locator(".contact-qr .placeholder")).toHaveCount(2);
    await noOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`detail-${width}.png`), fullPage: true });
  });
}

test("detail keeps anchors, capability modal, image preview, phone binding and both back controls", async ({ page }) => {
  // Uni H5 tree-shakes the global interceptor API. Capture only its outgoing
  // tel: assignment in the served JS, while executing the original click and
  // phone-number normalization. No external application can be launched.
  let interceptedPhoneBoundary = 0;
  await page.addInitScript(() => { (window as unknown as { __visualPhones: string[] }).__visualPhones = []; });
  await page.route("**/assets/*.js", async route => {
    const response = await route.fetch();
    const body = await response.text();
    const safe = body.replace(/window\.location\.href\s*=\s*`tel:\$\{([A-Za-z_$][\w$]*)\}`/g, (_match, variable) => {
      interceptedPhoneBoundary++;
      return `window.__visualPhones.push(${variable})`;
    });
    await route.fulfill({ response, body: safe });
  });
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(urls.h5 + "/#/pages/products/index");
  await page.locator(".search input").fill("视觉验证");
  await page.locator(".search uni-button").filter({ hasText: "搜索" }).click();
  const card = page.locator(".product-card").filter({ hasText: product.name.slice(0, 12) });
  await card.click();
  await expect(page.locator(".detail-title")).toHaveText(product.name);
  await page.locator(".view-materials").click();
  await expect(page.locator("#section-materials .section-title")).toBeInViewport();
  for (const [label, section] of [["价值", "problemValues"], ["能力", "features"], ["场景", "scenarios"], ["资料", "materials"]]) {
    await page.locator(".section-nav uni-button").filter({ hasText: label }).click();
    await expect(page.locator("#section-" + section + " .section-title")).toBeInViewport();
  }
  await page.locator(".capability-tag").first().click();
  await expect(page.locator(".uni-modal__title")).toHaveText(product.features[0].title);
  await expect(page.locator(".uni-modal__bd")).toHaveText(product.features[0].text);
  // The framework localizes its single confirmation action to the browser locale.
  await expect(page.locator(".uni-modal__btn")).toHaveCount(1);
  await page.locator(".uni-modal__btn").click();
  await expect(page.locator(".uni-modal")).not.toBeVisible();
  expect(interceptedPhoneBoundary, "the unique outgoing tel: boundary must be intercepted before clicking").toBe(1);
  const callButton = page.locator(".contact-phone uni-button");
  await callButton.click();
  expect(await page.evaluate(() => (window as unknown as { __visualPhones: string[] }).__visualPhones)).toEqual(["4006850800"]);
  await page.keyboard.press("Tab");
  await callButton.focus();
  await expect(callButton).toBeFocused();
  await expect(callButton).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => (window as unknown as { __visualPhones: string[] }).__visualPhones)).toEqual(["4006850800", "4006850800", "4006850800"]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".view-materials")).toHaveCSS("transition-duration", "0s");
  await page.locator(".material-card").filter({ hasText: "视觉验收分页图集" }).click();
  await expect(page).toHaveURL(/pages\/viewer\/index\?productId=/);
  const image = page.locator("#preview-surface img");
  await expect(image).toBeVisible();
  expect(await image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.locator(".controls uni-button").filter({ hasText: "下一页" }).click();
  await expect(page.locator(".controls input").first()).toHaveValue("2");
  await expect(image).toBeVisible();
  await expect(page.locator(".controls uni-button").filter({ hasText: "下一页" })).toHaveAttribute("disabled", "true");
  await page.locator(".viewer-navigation uni-button").filter({ hasText: "返回上一页" }).click();
  await expect(page.locator(".detail-title")).toHaveText(product.name);
  await page.locator(".back-link").click();
  await expect(page).toHaveURL(/pages\/products\/index/);
  await expect(page.locator(".search input")).toHaveValue("视觉验证");
  await card.click();
  await expect(page.locator(".detail-title")).toHaveText(product.name);
  const nativeBack = page.locator("uni-page-head .uni-page-head-btn");
  await expect(nativeBack).toHaveCount(1);
  await nativeBack.click();
  await expect(page).toHaveURL(/pages\/products\/index/);
  await expect(page.locator(".search input")).toHaveValue("视觉验证");
});

test("detail loading, retry, absent sections, empty materials and failed images retain their original behavior", async ({ page }) => {
  const sparse = { ...product, summary: "", audiences: "", tagline: "", model: "", problemValues: [], scenarios: [], features: [], technical: {}, materials: [] };
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
  let attempts = 0, broken = true;
  await fixture(page, {
    product: sparse, brokenMedia: () => broken,
    contact: { ...contact, officialQr: "data:image/png;base64,YmFk", phone: null },
    detail: async route => {
      if (++attempts === 1) {
        await firstResponse;
        return route.fulfill({ status: 503, json: { error: { code: "LOCAL_TEST", message: "本地只读错误样例" } } });
      }
      return route.fulfill({ json: { data: sparse, requestId: "visual-fixture" } });
    },
  });
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto(detailUrl(), { waitUntil: "domcontentloaded" });
  await expect(page.getByText("正在读取…", { exact: true })).toBeVisible();
  releaseFirst();
  await expect(page.getByRole("alert")).toContainText("本地只读错误样例");
  await page.getByRole("alert").getByText("重新加载", { exact: true }).click();
  await expect(page.locator(".detail-title")).toHaveText(sparse.name);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".product-introduction")).toHaveCount(0);
  for (const section of ["problemValues", "features", "scenarios"]) await expect(page.locator("#section-" + section)).toHaveCount(0);
  await expect(page.getByText("技术与使用说明", { exact: true })).toHaveCount(0);
  await expect(page.locator(".section-nav uni-button")).toHaveText(["资料"]);
  await expect(page.locator(".view-materials, .material-card")).toHaveCount(0);
  await expect(page.getByText("暂无可预览资料", { exact: true })).toBeVisible();
  await expect(page.locator(".contact-qr .placeholder")).toHaveCount(2);
  await expect(page.locator(".contact-phone .number")).toHaveText("暂未配置");
  await expect(page.locator(".contact-phone uni-button")).toHaveAttribute("disabled", "true");
  await page.locator(".media-list").scrollIntoViewIfNeeded();
  await expect(page.getByText("图片暂不可用", { exact: true })).toBeVisible();
  broken = false;
  await page.getByText("重试图片", { exact: true }).click();
  await expect(page.locator(".media-list .product-visual")).not.toHaveClass(/failed/);
  await expect(page.locator(".media-list .product-visual img")).toBeVisible();
  expect(await page.locator(".media-list .product-visual img").evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await noOverflow(page);
});

test("detail-only contact styling does not alter the shared home contact block", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(urls.h5);
  const block = page.locator(".contact-block");
  await expect(block).toBeVisible();
  await expect(block).toHaveCSS("padding", "16px");
  await expect(block).toHaveCSS("border-radius", "12px");
  await expect(block.locator(".contact-title")).toHaveCSS("font-size", "18px");
  await expect(block.locator(".contact-phone uni-button")).toHaveCSS("line-height", "38px");
  await expect(block.locator(".contact-phone .number")).toHaveText(contact.phone!);
  await expect(block.locator(".placeholder")).toHaveCount(2);
});
