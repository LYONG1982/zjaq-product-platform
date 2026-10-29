import { test, expect, urls, json, publicProductId } from "./support";
import { loginSales } from "./support";
test.beforeEach(async ({ page }) => { await loginSales(page); });
import { randomUUID } from "node:crypto";
import path from "node:path";
test("wizard cancellation creates no product", async ({ page, request }) => {
  const before = (await json(request, "/admin/products?limit=100")).body.data
    .length;
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "新增产品", exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("正式名称", { exact: true }).fill("取消输入");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "放弃输入", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await json(request, "/admin/products?limit=100")).body.data.length,
  ).toBe(before);
});
test("UI creates, edits, uploads, previews, publishes, updates and unpublishes one product", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  const name = "【验证数据】浏览器闭环软件-" + randomUUID().slice(0, 8);
  const model = "LOCAL-" + randomUUID();
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "新增产品", exact: true }).click();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByLabel("正式名称", { exact: true }).fill(name);
  await page
    .getByLabel("产品资料负责人", { exact: true })
    .fill("虚构测试人员");
  await page.getByLabel("产品型号", { exact: true }).fill(model);
  await page.getByRole("combobox", { name: "产品类型", exact: true }).selectOption("SOFTWARE");
  await page.getByRole("combobox", { name: "产品属性", exact: true }).selectOption("SELF_DEVELOPED");
  await page.getByRole("button", { name: "创建并开始制作" }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(name) }),
  ).toBeVisible();
  const id = (
    await json(request, "/admin/products?q=" + encodeURIComponent(name))
  ).body.data[0].productId;
  expect(id).toMatch(/^ZJ-D-S-A-\d{3}$/);
  await page
    .getByLabel("一句话定位", { exact: false })
    .fill("虚构定位，仅本地检查");
  await page.getByLabel("产品简介", { exact: false }).fill("第一版虚构介绍");
  for (const group of ["问题与价值", "核心功能", "应用场景"]) {
    await page.getByRole("button", { name: "添加" + group + "条目" }).click();
    await page.getByLabel(group + "标题 1").fill("测试" + group);
    await page.getByLabel(group + "说明 1").fill("仅供本地流程验证");
  }
  await page.getByLabel("部署说明", { exact: false }).fill("虚构本地部署条件");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText(/草稿已保存/)).toBeVisible();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
  await dialog
    .getByLabel("资料名称", { exact: true })
    .fill("【验证资料】浏览器 PDF");
  await dialog
    .getByRole("combobox", { name: "资料一级分类", exact: true })
    .selectOption("promotional");
  await dialog
    .getByRole("combobox", { name: "资料二级分类", exact: true })
    .selectOption("deck");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(path.resolve("tests/fixtures/validation/sample-v1.pdf"));
  await expect(dialog.getByText("PDF 已就绪 · 2 页")).toBeVisible({
    timeout: 25000,
  });
  await dialog.getByRole("button", { name: "加入本次编辑" }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText(/草稿已保存/)).toBeVisible();
  const draftWithMaterial = (await json(
    request,
    "/admin/products/" + id + "/draft",
  )).body.data;
  expect(draftWithMaterial.content.materials[0]).toMatchObject({
    category: "promotional",
    subCategory: "deck",
  });
  await page.getByRole("button", { name: "查看历史版本" }).click();
  const history = page.getByRole("dialog", { name: "资料历史版本" });
  await expect(history.getByText(/浏览器 PDF · V1\.0/)).toBeVisible();
  await history.getByRole("button", { name: "预览", exact: true }).click();
  const historicalPreview = page.getByRole("dialog", { name: /历史预览/ });
  await expect(historicalPreview.locator("canvas")).toBeVisible();
  await historicalPreview.getByRole("button", { name: "关闭预览" }).click();
  await history.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByText(/草稿预览，未对外发布/)).toBeVisible();
  await page.getByRole("button", { name: "移动宽度" }).click();
  await page.screenshot({
    path: "work/round04/preview-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "PC 宽度" }).click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("第 1 / 2 页")).toBeVisible();
  await expect(page.getByText("正在加载预览…")).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(page.getByRole("dialog").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("第 2 / 2 页")).toBeVisible();
  await expect(page.getByText("正在加载预览…")).toHaveCount(0);
  await page.screenshot({
    path: "work/round04/pdf-browser.png",
    fullPage: true,
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭【验证资料】浏览器 PDF" })
    .click();
  await page.getByRole("button", { name: "发布此草稿" }).click();
  const confirm = page.getByRole("dialog", { name: "确认发布", exact: true });
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect(page.getByText(/发布成功 · 本地目录已生效/)).toBeVisible();
  const portal = await page.context().newPage();
  await portal.goto(urls.portal + "/products?q=" + encodeURIComponent(name));
  await expect(
    portal.getByRole("heading", { name: /浏览器闭环软件/ }),
  ).toBeVisible();
  await portal.screenshot({
    path: "work/round04/portal-published.png",
    fullPage: true,
  });
  await portal.close();
  const publicId = await publicProductId(request, name);
  const first = (await json(request, "/catalog/products/" + publicId)).body.data;
  expect(first.summary).toBe("第一版虚构介绍");
  expect(first.model).toBe(model);
  expect(JSON.stringify(first)).not.toContain(id);
  const previewPath = first.materials[0].previewPath;
  const manifest = (await request.get(urls.api + previewPath)).json();
  const oldContent = (await manifest).data.parts[0].path;
  await page
    .getByLabel("产品简介", { exact: false })
    .fill("第二版尚未发布介绍");
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText(/草稿已保存/)).toBeVisible();
  expect(
    (await json(request, "/catalog/products/" + publicId)).body.data.summary,
  ).toBe("第一版虚构介绍");
  await expect(page.getByText(/有未发布修改/)).toBeVisible();
  await page.screenshot({
    path: "work/round04/editor-1440.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "发布更新", exact: true }).click();
  await page
    .getByRole("dialog", { name: "确认发布" })
    .getByRole("checkbox")
    .check();
  await page
    .getByRole("dialog", { name: "确认发布" })
    .getByRole("button", { name: "确认发布", exact: true })
    .click();
  await expect(page.getByText(/第 2 次发布/)).toBeVisible();
  expect(
    (await json(request, "/catalog/products/" + publicId)).body.data.summary,
  ).toBe("第二版尚未发布介绍");
  expect((await request.get(urls.api + oldContent)).status()).toBe(409);
  const h5 = await page.context().newPage();
  await h5.route("**/api/**", async (r) => {
    const requested = new URL(r.request().url());
    await r.fulfill({
      response: await r.fetch({
        url: urls.api + requested.pathname + requested.search,
      }),
    });
  });
  await h5.setViewportSize({ width: 320, height: 844 });
  await h5.goto(urls.h5 + "/#/pages/products/index");
  await h5.locator("uni-input input").fill(name);
  await h5.locator("uni-input input").press("Enter");
  await expect(h5.getByText(name.slice(0, 15) + "…", { exact: true })).toBeVisible();
  expect(
    await h5.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await h5.screenshot({
    path: "work/round04/h5-published-320.png",
    fullPage: true,
  });
  await page.getByLabel("产品简介", { exact: false }).fill("");
  await page.getByRole("button", { name: "下架产品", exact: true }).click();
  await page.getByRole("button", { name: "确认下架", exact: true }).click();
  await expect(page.getByText(/已下架，本地公共目录停止/)).toBeVisible();
  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();
  expect((await json(request, "/catalog/products/" + publicId)).status).toBe(404);
  await h5.reload();
  await h5.locator("uni-input input").fill(name);
  await h5.locator("uni-input input").press("Enter");
  await expect(h5.getByText("没有找到相关内容", { exact: true })).toBeVisible();
  await h5.close();
  await page.getByRole("button", { name: "← 返回产品管理" }).click();
  await expect(
    page.getByRole("dialog", { name: "有未保存修改" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(page.getByLabel("产品简介", { exact: false })).toHaveValue("");
});
test("save conflict preserves local input and offers explicit comparison", async ({
  page,
  request,
}) => {
  const made = await json(
    request,
    "/admin/products",
    "POST",
    {
      name: "【验证数据】冲突样例",
      owner: "虚构人员",
      categoryId: "miding",
      templateId: "software",
      templateVersion: 1,
      model: "LOCAL-BROWSER-" + randomUUID(), productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
    },
    randomUUID(),
  );
  const id = made.body.data.productId;
  await page.goto(urls.admin);
  await page.getByLabel("搜索产品").fill("冲突样例");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: id })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page
    .getByLabel("产品简介", { exact: false })
    .fill("需要保留的本地输入");
  await json(request, "/admin/products/" + id + "/draft", "PATCH", {
    expectedDraftVersion: 1,
    content: { ...made.body.data.content, summary: "另一个窗口已保存" },
  });
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByText("其他窗口已修改此产品，请核对后再保存"),
  ).toBeVisible();
  await expect(page.getByLabel("产品简介", { exact: false })).toHaveValue(
    "需要保留的本地输入",
  );
  await page.getByRole("button", { name: "读取最新草稿并对比" }).click();
  await expect(page.getByRole("dialog")).toContainText("另一个窗口已保存");
  await expect(page.getByRole("dialog")).toContainText("需要保留的本地输入");
  await page.screenshot({ path: "work/round04/conflict.png", fullPage: true });
});
test("image ordering and missing-field publish errors work through the editor", async ({
  page,
  request,
}) => {
  const created = await json(
    request,
    "/admin/products",
    "POST",
    {
      name: "【验证数据】图片顺序设备",
      owner: "虚构人员",
      categoryId: "miyi",
      templateId: "device",
      templateVersion: 1,
      model: "LOCAL-BROWSER-" + randomUUID(), productType: "SOFTWARE", ownership: "SELF_DEVELOPED",
    },
    randomUUID(),
  );
  const id = created.body.data.productId;
  await page.goto(urls.admin);
  await page.getByLabel("搜索产品").fill("图片顺序设备");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page
    .getByRole("row")
    .filter({ hasText: id })
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "添加资料", exact: true });
  await dialog
    .getByLabel("资料名称", { exact: true })
    .fill("【验证资料】图片顺序");
  await dialog
    .getByRole("combobox", { name: "资料一级分类", exact: true })
    .selectOption("promotional");
  await dialog
    .getByRole("combobox", { name: "资料二级分类", exact: true })
    .selectOption("onepager");
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(
      [1, 2, 3].map((i) =>
        path.resolve(`tests/fixtures/validation/page-${i}.png`),
      ),
    );
  await expect(dialog.getByLabel("第 3 页替代文字")).toBeVisible({
    timeout: 20000,
  });
  await dialog
    .getByRole("button", { name: "将第 1 页下移", exact: true })
    .click();
  await expect(dialog.getByLabel("第 1 页替代文字")).toHaveValue("资料第 2 页");
  await dialog.getByRole("button", { name: "检查预览件" }).click();
  const viewer = page.getByRole("dialog", { name: "资料文件预览" });
  await expect(viewer.getByRole("img")).toBeVisible();
  await viewer.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(viewer.getByText("第 2 / 3 页")).toBeVisible();
  await viewer.getByRole("button", { name: "关闭资料文件预览" }).click();
  await dialog.getByRole("button", { name: "加入本次编辑" }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.getByText(/草稿已保存/)).toBeVisible();
  const data = (await json(request, "/admin/products/" + id + "/draft")).body
    .data;
  expect(data.content.materials[0].preview.pages[0].alt).toBe("资料第 2 页");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "确认发布" });
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: "确认发布", exact: true }).click();
  await expect(confirm.getByText(/未发布，当前线上内容保持不变/)).toBeVisible();
  expect((await json(request, "/catalog/products/" + id)).status).toBe(404);
  await page.screenshot({
    path: "work/round04/publish-errors.png",
    fullPage: true,
  });
});
