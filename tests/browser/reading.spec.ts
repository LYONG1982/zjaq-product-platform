import { test, expect, urls, json, publicProductId } from "./support";
import { loginSales } from "./support";
test.beforeEach(async ({ page }) => { await loginSales(page); });
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
test("portal V3 home, search filters, product detail and native back keep navigation state", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(urls.portal);
  await expect(
    page.getByRole("heading", { name: /中技于密.*安全于行/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "work/round04/portal-home.png",
    fullPage: true,
  });
  await page.getByLabel("搜索产品").fill("资料问答");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "【Demo】资料问答助手" }),
  ).toBeVisible();
  await page
    .getByRole("link")
    .filter({ hasText: "【Demo】资料问答助手" })
    .click();
  await expect(
    page.getByRole("heading", { name: "技术与使用说明" }),
  ).toBeVisible();
  await expect(page.getByText("输入说明", { exact: true })).toBeVisible();
  await expect(page.getByText("部署方式", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "work/round04/product-detail.png",
    fullPage: true,
  });
  await page.goBack();
  await expect(page.getByLabel("搜索产品")).toHaveValue("资料问答");
});
test("PDF reader renders embedded Chinese text, page input, zoom, keyboard and fullscreen", async ({
  page,
  request,
}) => {
  const demo = await publicProductId(request, "【Demo】资料问答助手");
  const pdfPath = "/viewer?productId=" + demo + "&materialId=demo-introduction";
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(urls.portal + pdfPath);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByLabel("页码")).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "放大", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.getByText("125%")).toBeVisible();
  await expect(page.getByLabel("页码")).toBeEnabled();
  await page.getByLabel("页码").fill("3");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toBeDisabled();
  await page.locator(".viewer-shell").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByLabel("页码")).toHaveValue("2");
  await page.getByRole("button", { name: "全屏 / 退出" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.getByRole("button", { name: "全屏 / 退出" }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.screenshot({
    path: "work/round04/pdf-viewer.png",
    fullPage: true,
  });
});
test("ordered image preview reaches final page without exposing source files", async ({
  page,
  request,
}) => {
  const demo = await publicProductId(request, "【Demo】资料问答助手");
  await page.goto(
    urls.portal + "/viewer?productId=" + demo + "&materialId=demo-slides",
  );
  await expect(page.getByAltText("资料第 1 页")).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByAltText("资料第 2 页")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByAltText("资料第 3 页")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "下载资料", exact: true })).toHaveAttribute("href", /\/api\/sales\/catalog\/products\//);
  await page.screenshot({
    path: "work/round04/image-viewer.png",
    fullPage: true,
  });
});
test("an open reader rejects later publication changes and offline content", async ({
  page,
  request,
}) => {
  const created = (
    await json(
      request,
      "/admin/products",
      "POST",
      {
        name: "【浏览器测试】版本隔离",
        categoryId: "ai",
        templateId: "ai",
        templateVersion: 1,
        model: "LOCAL-READER-" + randomUUID(), productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
        owner: "隔离测试",
      },
      randomUUID(),
    )
  ).body.data;
  const bytes = await readFile("tests/fixtures/demo-ai/资料问答助手_Demo.pdf");
  const upload = (
    await json(
      request,
      "/admin/uploads",
      "POST",
      {
        productId: created.productId,
        purpose: "preview",
        fileName: "test.pdf",
        contentType: "application/pdf",
        size: bytes.length,
      },
      randomUUID(),
    )
  ).body.data;
  await request.put(urls.api + upload.uploadPath, {
    headers: {
      Authorization: "Bearer local-mock",
      "Content-Type": "application/octet-stream",
    },
    data: bytes,
  });
  const ready = (
    await json(request, "/admin/uploads/complete", "POST", {
      uploadId: upload.uploadId,
    })
  ).body.data;
  expect(ready.status).toBe("READY");
  const item = { id: "one", title: "测试说明", text: "仅本地测试" };
  const content = {
    ...created.content,
    tagline: "测试",
    summary: "测试首段  保留空格。\n测试第二段  保留空格。",
    problemValues: [item],
    features: [item],
    scenarios: [item],
    boundaries: "仅验证版本变化",
    technical: { inputs: "示例文档", outputs: "草稿", humanReview: "人工复核" },
    materials: [
      {
        materialId: "reader",
        versionId: "reader-v1",
        name: "版本隔离资料",
        kind: "brochure",
        category: "promotional",
        subCategory: "deck",
        versionLabel: "v1",
        preview: { kind: "pdf", assetId: ready.assetId, pageCount: 3 },
      },
    ],
  };
  const saved = (
    await json(
      request,
      "/admin/products/" + created.productId + "/draft",
      "PATCH",
      { expectedDraftVersion: 1, content },
    )
  ).body.data;
  const publish = (
    await json(
      request,
      "/admin/products/" + created.productId + "/publish",
      "POST",
      {
        expectedDraftVersion: saved.draftVersion,
        expectedPublicationVersion: 0,
        publicContentConfirmed: true,
      },
      randomUUID(),
    )
  ).body.data;
  const publicId = await publicProductId(request, "【浏览器测试】版本隔离", publish.releaseId);
  await page.goto(urls.portal + "/products/" + publicId);
  const paragraphs = page.locator(".product-summary p");
  await expect(paragraphs).toHaveCount(2);
  expect(await paragraphs.nth(0).textContent()).toBe("测试首段  保留空格。");
  expect(await paragraphs.nth(1).textContent()).toBe("测试第二段  保留空格。");
  for (const paragraph of await paragraphs.all()) {
    const style = await paragraph.evaluate((element) => { const value = getComputedStyle(element); return { indent: value.textIndent, whitespace: value.whiteSpace, line: parseFloat(value.lineHeight) / parseFloat(value.fontSize) }; });
    expect(style.indent).toBe("32px"); expect(style.whitespace).toBe("pre-wrap"); expect(style.line).toBeGreaterThanOrEqual(1.7);
  }
  expect(await paragraphs.nth(0).evaluate((element) => parseFloat(getComputedStyle(element).marginBottom))).toBeGreaterThan(0);
  await page.goto(
    urls.portal +
      "/viewer?productId=" +
      publicId +
      "&materialId=reader",
  );
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toBeEnabled();
  const changed = (
    await json(
      request,
      "/admin/products/" + created.productId + "/draft",
      "PATCH",
      {
        expectedDraftVersion: saved.draftVersion,
        content: { ...content, summary: "第二版正文" },
      },
    )
  ).body.data;
  const second = (
    await json(
      request,
      "/admin/products/" + created.productId + "/publish",
      "POST",
      {
        expectedDraftVersion: changed.draftVersion,
        expectedPublicationVersion: publish.publicationVersion,
        publicContentConfirmed: true,
      },
      randomUUID(),
    )
  ).body.data;
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "资料已更新，请打开当前版本" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "打开当前版本" }).click();
  await expect(
    page.getByRole("button", { name: "下一页", exact: true }),
  ).toBeEnabled();
  await json(
    request,
    "/admin/products/" + created.productId + "/unpublish",
    "POST",
    { expectedPublicationVersion: second.publicationVersion },
    randomUUID(),
  );
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("heading", { name: /暂不可用/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /暂不可用/ })).toBeVisible();
});
for (const width of [390, 320])
  test("H5 detail and PDF preview at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(urls.h5 + "/#/pages/products/index");
    await page
      .locator(".product-card")
      .filter({ hasText: "【Demo】资料问答助手" })
      .click({ timeout: 5000 });
    await expect(page.getByText("输入说明", { exact: true })).toBeVisible();
    await page
      .locator(".section-nav uni-button")
      .filter({ hasText: "资料" })
      .click();
    await expect(page.getByText("产品资料", { exact: true })).toBeInViewport();
    await page.screenshot({
      path: "work/round04/h5-detail-" + width + ".png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page
      .locator(".material-card")
      .filter({ hasText: "资料问答助手 · 产品介绍" })
      .click({ timeout: 5000 });
    await expect(page.locator("#preview-surface canvas")).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByText("正在读取…", { exact: true }),
    ).not.toBeVisible();
    await page.locator("uni-button").filter({ hasText: "下一页" }).click();
    await expect(page.locator(".controls input").first()).toHaveValue("2");
    await expect(
      page.getByText("正在读取…", { exact: true }),
    ).not.toBeVisible();
    await page.screenshot({
      path: "work/round04/h5-pdf-" + width + ".png",
      fullPage: true,
    });
  });
test("H5 transport failure shows retry instead of an empty catalog", async ({
  page,
}) => {
  await page.route("**/api/v1/catalog/**", (route) => route.abort("failed"));
  await page.goto(urls.h5);
  await expect(page.getByText("暂时无法连接", { exact: true })).toBeVisible();
  await expect(page.getByText("暂无发布内容", { exact: true })).toHaveCount(0);
});
test("admin light sidebar exposes category and account management with clear forms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "分类与模板", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "产品分类", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增分类", exact: true }).click();
  await page
    .getByLabel("分类名称", { exact: true })
    .fill("【测试】浏览器分类 " + Date.now());
  await page.getByLabel("简称", { exact: true }).fill("测试分类");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "后台账号", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("tbody").getByText("本地模拟管理员", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增账号", exact: true }).click();
  await page
    .getByLabel("身份主体", { exact: false })
    .fill("browser-subject-" + Date.now());
  await page.getByLabel("显示名称", { exact: true }).fill("浏览器验证制作人");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  const account = page
    .locator("tbody tr")
    .filter({ hasText: "浏览器验证制作人" });
  await expect(account).toBeVisible();
  await account.getByRole("button", { name: "修改", exact: true }).click();
  await page.getByLabel("启用账号", { exact: true }).uncheck();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(account.getByText("禁用", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "work/round04/admin-settings.png",
    fullPage: true,
  });
});
test("portal remains readable at a 720px effective desktop viewport and supports keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 720, height: 512 });
  await page.goto(urls.portal);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "中技 中技安全 产品平台" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/round04/portal-effective-200.png",
    fullPage: true,
  });
});
