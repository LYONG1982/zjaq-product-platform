import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test, expect, urls, json } from "./support";

const fixture = (name: string) => path.resolve("tests/fixtures/validation/" + name);

test.beforeAll(async ({ request }) => {
  const configured = process.env.TEST_API_URL;
  expect(configured, "upload journey requires an explicit TEST_API_URL").toBeTruthy();
  const api = new URL(configured!);
  expect(api.protocol, "TEST_API_URL must use HTTP").toBe("http:");
  expect(["127.0.0.1", "localhost", "[::1]"], "TEST_API_URL must be loopback").toContain(api.hostname);
  expect(api.pathname, "TEST_API_URL must be an exact origin").toBe("/");
  expect(api.username + api.password + api.search + api.hash).toBe("");
  const adminConfigured = process.env.TEST_ADMIN_URL;
  expect(adminConfigured, "upload journey requires an explicit isolated TEST_ADMIN_URL").toBeTruthy();
  const admin = new URL(adminConfigured!);
  expect(admin.protocol).toBe("http:");
  expect(["127.0.0.1", "localhost", "[::1]"]).toContain(admin.hostname);
  expect(admin.pathname).toBe("/");
  expect(admin.username + admin.password + admin.search + admin.hash).toBe("");
  const health = await request.get(urls.api + "/health");
  expect(health.status()).toBe(200);
  expect((await health.json()).provider, "upload verification requires a local mock provider").toBe("mock");
});

test.beforeEach(async ({ page }) => {
  // Route every browser API call to the explicitly validated mock origin,
  // regardless of the API base embedded in the admin dev bundle.
  await page.route("**/api/v1/**", route => {
    const requested = new URL(route.request().url());
    return route.continue({ url: urls.api + requested.pathname + requested.search });
  });
});

async function createProduct(request: import("@playwright/test").APIRequestContext, label: string) {
  const name = `【上传旅程】${label}-${randomUUID().slice(0, 8)}`;
  const result = await json(request, "/admin/products", "POST", {
    name,
    owner: "虚构验证人员",
    categoryId: "miding",
    templateId: "software",
    templateVersion: 1,
    model: "UPLOAD-" + randomUUID(),
    productType: "SOFTWARE",
    ownership: "SELF_DEVELOPED",
  }, randomUUID());
  expect(result.status).toBeLessThan(300);
  return { name, product: result.body.data };
}

async function uploadFixture(
  request: import("@playwright/test").APIRequestContext,
  productId: string,
  fileName: string,
) {
  const bytes = await readFile(fixture(fileName));
  const contentType = fileName.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const intent = await json(request, "/admin/uploads", "POST", {
    productId,
    purpose: "preview",
    fileName,
    contentType,
    size: bytes.length,
  }, randomUUID());
  expect(intent.status).toBeLessThan(300);
  const upload = intent.body.data;
  const put = await request.put(urls.api + upload.uploadPath, {
    headers: { Authorization: "Bearer local-mock", "Content-Type": "application/octet-stream" },
    data: bytes,
  });
  expect(put.status()).toBe(200);
  const complete = await json(request, "/admin/uploads/complete", "POST", { uploadId: upload.uploadId });
  expect(complete.status).toBeLessThan(300);
  expect(complete.body.data.status).toBe("READY");
  return complete.body.data;
}

async function createProductWithPdf(request: import("@playwright/test").APIRequestContext, label: string) {
  const created = await createProduct(request, label);
  const pdf = await uploadFixture(request, created.product.productId, "sample-v1.pdf");
  const material = {
    materialId: randomUUID(),
    versionId: randomUUID(),
    name: "【验证资料】既有 PDF",
    kind: "brochure",
    category: "promotional",
    subCategory: "deck",
    versionLabel: "V1.0",
    preview: { kind: "pdf", assetId: pdf.assetId, pageCount: pdf.pageCount },
  };
  const updated = await json(request, "/admin/products/" + created.product.productId + "/draft", "PATCH", {
    expectedDraftVersion: created.product.draftVersion,
    content: { ...created.product.content, materials: [material] },
  }, randomUUID());
  expect(updated.status).toBe(200);
  return { ...created, material, draft: updated.body.data };
}

async function openProduct(page: import("@playwright/test").Page, name: string) {
  await page.goto(urls.admin);
  await page.getByLabel("搜索产品", { exact: true }).fill(name);
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "编辑", exact: true }).click();
}

async function chooseAndUpload(dialog: import("@playwright/test").Locator, filePath: string) {
  await dialog.locator('input[type="file"]').setInputFiles(filePath);
  await dialog.getByRole("button", { name: "上传", exact: true }).click();
}

test("selecting a PDF makes no reservation; explicit upload unlocks fields and completion only updates the parent editor", async ({ page, request }, testInfo) => {
  const { name, product } = await createProduct(request, "新资料");
  const events: { method: string; pathname: string }[] = [];
  page.on("request", req => {
    const url = new URL(req.url());
    events.push({ method: req.method(), pathname: url.pathname });
  });
  await openProduct(page, name);
  await page.getByRole("button", { name: "上传资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "上传资料", exact: true });
  const complete = dialog.getByRole("button", { name: "完成", exact: true });
  await dialog.screenshot({ path: testInfo.outputPath("upload-empty.png") });
  await expect(dialog.getByLabel("版本标签")).toHaveValue("V01.0");
  await expect(complete).toBeDisabled();
  await expect(dialog.getByLabel("资料名称")).toBeDisabled();
  await dialog.locator('input[type="file"]').setInputFiles(fixture("sample-v1.pdf"));
  await expect(dialog.getByText("sample-v1.pdf", { exact: true })).toBeVisible();
  await dialog.screenshot({ path: testInfo.outputPath("upload-selected.png") });
  expect(events.filter(e => e.method === "POST" && e.pathname.endsWith("/admin/uploads"))).toHaveLength(0);
  expect(events.filter(e => e.method === "PUT" && e.pathname.includes("/admin/uploads/"))).toHaveLength(0);
  await dialog.getByRole("button", { name: "上传", exact: true }).click();
  await expect(dialog.getByText("PDF 已就绪 · 2 页")).toBeVisible({ timeout: 25000 });
  await expect(dialog.getByLabel("资料名称")).toHaveValue("sample-v1");
  await expect(dialog.getByLabel("资料名称")).toBeEnabled();
  await expect(dialog.getByLabel("版本标签")).toHaveValue("V01.0");
  await dialog.screenshot({ path: testInfo.outputPath("upload-ready-fields.png") });
  await expect(complete).toBeDisabled();
  await dialog.getByLabel("资料一级分类").selectOption("promotional");
  await dialog.getByLabel("资料二级分类").selectOption("deck");
  await expect(complete).toBeEnabled();
  await dialog.screenshot({ path: testInfo.outputPath("upload-complete-enabled.png") });
  expect(events.filter(e => e.method === "POST" && e.pathname.endsWith("/admin/uploads"))).toHaveLength(1);
  expect(events.filter(e => e.method === "PUT" && e.pathname.includes("/admin/uploads/"))).toHaveLength(1);
  expect(events.filter(e => e.method === "PATCH" && e.pathname.endsWith(`/admin/products/${product.productId}/draft`))).toHaveLength(0);
  await complete.click();
  await expect(page.getByRole("dialog", { name: "上传资料", exact: true })).toHaveCount(0);
  await expect(page.getByText("资料已加入本次编辑，请保存草稿。", { exact: true })).toBeVisible();
  expect(events.filter(e => e.method === "PATCH" && e.pathname.endsWith(`/admin/products/${product.productId}/draft`))).toHaveLength(0);
});

test("a successfully uploaded DOCX source still requires a preview before completion", async ({ page, request }) => {
  const { name } = await createProduct(request, "DOCX 源件");
  await openProduct(page, name);
  await page.getByRole("button", { name: "上传资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "上传资料", exact: true });
  await chooseAndUpload(dialog, fixture("sample-source.docx"));
  await expect(dialog.getByText("源文件已上传。请再上传 PDF、图片或视频预览件，才能完成资料。", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("资料名称")).toHaveValue("sample-source");
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
});

test("deleting a successful upload preserves a manual name and clears the previous batch progress", async ({ page, request }) => {
  const { name } = await createProduct(request, "删除重传");
  await openProduct(page, name);
  await page.getByRole("button", { name: "上传资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "上传资料", exact: true });
  await chooseAndUpload(dialog, fixture("sample-v1.pdf"));
  await expect(dialog.getByText("PDF 已就绪 · 2 页")).toBeVisible({ timeout: 25000 });
  await dialog.getByLabel("资料名称").fill("手工保留名称");
  await dialog.getByRole("button", { name: "删除sample-v1.pdf", exact: true }).click();
  await dialog.locator('input[type="file"]').setInputFiles(fixture("sample-v2.pdf"));
  await expect(dialog.getByLabel("资料名称")).toHaveValue("手工保留名称");
  await expect(dialog.getByRole("progressbar", { name: "文件上传进度" })).toHaveCount(0);
  await expect(dialog.getByText("文件已选择，点击“上传”开始。", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "上传", exact: true }).click();
  await expect(dialog.getByText("PDF 已就绪 · 2 页")).toBeVisible({ timeout: 25000 });
  await expect(dialog.getByLabel("资料名称")).toHaveValue("手工保留名称");
});

test("checking progress stays at real 100 percent during delayed failure and retry reuses the uploaded task without another PUT", async ({ page, request }, testInfo) => {
  const { name } = await createProduct(request, "检查重试");
  let firstComplete = true;
  let enteredComplete!: () => void;
  const completeEntered = new Promise<void>(resolve => { enteredComplete = resolve; });
  await page.route("**/api/v1/admin/uploads/complete", async route => {
    if (!firstComplete) return route.fallback();
    firstComplete = false;
    enteredComplete();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({ status: 503, json: { error: { code: "TEMPORARY_FAILURE", message: "temporary complete failure" } } });
  });
  const putUrls: string[] = [];
  page.on("request", req => {
    if (req.method() === "PUT" && new URL(req.url()).pathname.includes("/admin/uploads/")) putUrls.push(req.url());
  });
  await openProduct(page, name);
  await page.getByRole("button", { name: "上传资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "上传资料", exact: true });
  await dialog.locator('input[type="file"]').setInputFiles(fixture("sample-v1.pdf"));
  await dialog.getByRole("button", { name: "上传", exact: true }).click();
  await completeEntered;
  const progress = dialog.getByRole("progressbar", { name: "文件上传进度" });
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await expect(dialog.getByRole("status")).toContainText("正在检查文件");
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
  await dialog.screenshot({ path: testInfo.outputPath("upload-checking-100-percent.png") });
  await expect(dialog.getByRole("button", { name: "重试上传", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  expect(putUrls).toHaveLength(1);
  await dialog.getByRole("button", { name: "重试上传", exact: true }).click();
  await expect(dialog.getByText("PDF 已就绪 · 2 页")).toBeVisible({ timeout: 25000 });
  expect(putUrls).toHaveLength(1);
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
});

async function openExistingMaterial(page: import("@playwright/test").Page, created: Awaited<ReturnType<typeof createProductWithPdf>>) {
  await openProduct(page, created.name);
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  return page.getByRole("dialog", { name: "编辑资料", exact: true });
}

async function queueTwoImagesWithSecondPutFailure(page: import("@playwright/test").Page, dialog: import("@playwright/test").Locator) {
  let puts = 0;
  const putUrls: string[] = [];
  await page.route("**/api/v1/admin/uploads/*/content", async route => {
    puts += 1;
    putUrls.push(route.request().url());
    if (puts === 2) return route.abort("failed");
    return route.fallback();
  });
  await dialog.locator('input[type="file"]').setInputFiles([fixture("page-2.png"), fixture("page-1.png")]);
  await dialog.getByRole("button", { name: "上传", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "重试上传", exact: true })).toBeVisible({ timeout: 25000 });
  return { putUrls, getPutCount: () => puts };
}

test("partial image failure keeps the old PDF until retry succeeds, then adopts naturally ordered images", async ({ page, request }, testInfo) => {
  const created = await createProductWithPdf(request, "两图部分失败");
  let uploadIntentPosts = 0;
  page.on("request", req => {
    if (req.method() === "POST" && new URL(req.url()).pathname.endsWith("/admin/uploads")) uploadIntentPosts++;
  });
  const dialog = await openExistingMaterial(page, created);
  const failure = await queueTwoImagesWithSecondPutFailure(page, dialog);
  await expect(dialog.getByText("当前预览类型：PDF")).toBeVisible();
  await expect(dialog.getByLabel("版本标签")).toHaveValue("V1.0");
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
  await dialog.screenshot({ path: testInfo.outputPath("upload-partial-failure-old-pdf.png") });
  await dialog.getByRole("button", { name: "检查预览件", exact: true }).click();
  const viewer = page.getByRole("dialog", { name: "资料文件预览", exact: true });
  await expect(viewer.locator("canvas")).toBeVisible();
  await viewer.getByRole("button", { name: "关闭资料文件预览", exact: true }).click();

  const postsBeforeBlockedChoose = uploadIntentPosts;
  await dialog.locator('input[type="file"]').setInputFiles(fixture("sample-v2.pdf"));
  await expect(dialog.getByRole("alert")).toContainText("请先应用或删除已经上传的替换文件");
  expect(uploadIntentPosts).toBe(postsBeforeBlockedChoose);

  await dialog.getByRole("button", { name: "重试上传", exact: true }).click();
  await expect(dialog.getByText("当前预览类型：有序图片")).toBeVisible({ timeout: 25000 });
  await expect(dialog.getByLabel("版本标签")).toHaveValue("V1.1");
  const rows = dialog.getByRole("list", { name: "资料文件列表" }).locator("li");
  const imageOrder = await rows.evaluateAll(nodes => nodes.filter(node => /page-[12]\.png/.test(node.textContent ?? "")).map(node => node.textContent));
  expect(imageOrder[0]).toContain("page-1.png");
  expect(imageOrder[1]).toContain("page-2.png");
  expect(failure.getPutCount()).toBe(3);
  expect(failure.putUrls[0]).not.toBe(failure.putUrls[1]);
  expect(failure.putUrls[1]).toBe(failure.putUrls[2]);
});

test("removing staged and failed replacement files preserves the old PDF and draft version", async ({ page, request }) => {
  const created = await createProductWithPdf(request, "清理替换");
  const dialog = await openExistingMaterial(page, created);
  await queueTwoImagesWithSecondPutFailure(page, dialog);
  await dialog.getByRole("button", { name: "删除page-1.png", exact: true }).click();
  await dialog.getByRole("button", { name: "删除page-2.png", exact: true }).click();
  await expect(dialog.getByText("当前预览类型：PDF")).toBeVisible();
  await expect(dialog.getByLabel("版本标签")).toHaveValue("V1.0");
  const complete = dialog.getByRole("button", { name: "完成", exact: true });
  await expect(complete).toBeEnabled();
  let draftPatches = 0;
  page.on("request", req => {
    if (req.method() === "PATCH" && new URL(req.url()).pathname.endsWith(`/admin/products/${created.product.productId}/draft`)) draftPatches++;
  });
  await complete.click();
  await expect(page.getByText("资料已加入本次编辑，请保存草稿。", { exact: true })).toBeVisible();
  expect(draftPatches).toBe(0);
  const current = await json(request, "/admin/products/" + created.product.productId + "/draft");
  expect(current.body.data.draftVersion).toBe(created.draft.draftVersion);
  expect(current.body.data.content.materials[0]).toMatchObject({ name: created.material.name, versionLabel: "V1.0", preview: created.material.preview });
});

test("deleting only the failed file requires explicit application of the remaining staged image", async ({ page, request }) => {
  const created = await createProductWithPdf(request, "显式应用替换");
  const dialog = await openExistingMaterial(page, created);
  await queueTwoImagesWithSecondPutFailure(page, dialog);
  await dialog.getByRole("button", { name: "删除page-2.png", exact: true }).click();
  await expect(dialog.getByText("当前预览类型：PDF")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "应用已上传文件", exact: true }).click();
  await expect(dialog.getByText("当前预览类型：有序图片")).toBeVisible();
  await expect(dialog.getByLabel("版本标签")).toHaveValue("V1.1");
  await expect(dialog.getByRole("button", { name: "完成", exact: true })).toBeEnabled();
});

test("upload modal keeps its footer visible and body scrollable at desktop, laptop and mobile widths with keyboard access", async ({ page, request }, testInfo) => {
  const { name } = await createProduct(request, "窄屏长文件名");
  await openProduct(page, name);
  await page.getByRole("button", { name: "上传资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "上传资料", exact: true });
  const longFile = "产品资料文件名称长文本排版验证".repeat(6) + ".pdf";
  const bytes = await readFile(fixture("sample-v1.pdf"));
  const fileInput = dialog.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: longFile, mimeType: "application/pdf", buffer: bytes });
  const summary = dialog.locator("details.format-help summary");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(dialog.locator("details.format-help")).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const layout = await dialog.evaluate(element => {
      const body = element.querySelector<HTMLElement>(".modal-body")!;
      const footer = element.querySelector<HTMLElement>(".modal-footer")!;
      const bounds = footer.getBoundingClientRect();
      return {
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        bodyOverflowY: getComputedStyle(body).overflowY,
        footerTop: bounds.top,
        footerBottom: bounds.bottom,
        viewportHeight: innerHeight,
        footerButtonVisible: !!footer.querySelector("button") && bounds.height > 0,
      };
    });
    expect(layout.bodyOverflowY).toBe("auto");
    expect(layout.bodyScrollHeight).toBeGreaterThan(layout.bodyClientHeight);
    expect(layout.footerTop).toBeGreaterThanOrEqual(0);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
    expect(layout.footerButtonVisible).toBe(true);
    await dialog.locator(".modal-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await dialog.locator(".modal-body").evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await dialog.screenshot({ path: testInfo.outputPath(`upload-layout-${viewport.width}x${viewport.height}.png`) });
  }
});
