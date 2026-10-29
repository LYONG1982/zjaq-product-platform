import { test, expect, urls, json } from "./support";
import { loginSales } from "./support";
test.beforeEach(async ({ page }) => { await loginSales(page); });

const shortName = "【Demo】资料问答助手";
const longName = "【验证数据】软件制作示例";

test("PC and mobile home omit the materials guide while keeping materials navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(urls.portal);
  await expect(page.locator(".material-callout")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "资料中心", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "中技于密，安全于行" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(urls.h5);
  await expect(page.locator(".material-callout")).toHaveCount(0);
  await expect(
    page.getByText("中技于密，安全于行", { exact: true }),
  ).toBeVisible();
  await page.getByText("资料", { exact: true }).click();
  await expect(page.getByText("资料中心", { exact: true })).toBeVisible();
});

test("PC short and long product cards keep titles accessible and align actions within 2px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(urls.portal + "/products");
  const shortCard = page.locator(".product-card").filter({ hasText: shortName });
  const longCard = page.locator(".product-card").filter({ hasText: longName });
  await expect(shortCard).toBeVisible();
  await expect(longCard).toBeVisible();

  for (const card of [shortCard, longCard]) {
    const title = card.locator("h3");
    const visibleLength = await title.evaluate((node) =>
      Array.from(node.textContent ?? "").length,
    );
    const accessibleName = await title.getAttribute("aria-label");
    expect(visibleLength).toBeLessThanOrEqual(15);
    expect(accessibleName).toBeTruthy();
    expect(Array.from(accessibleName!).length).toBeGreaterThanOrEqual(visibleLength);
  }
  await expect(longCard.locator("h3")).toHaveAttribute("aria-label", longName);

  const actionTops = await page.locator(".product-card").evaluateAll((cards) =>
    cards.slice(0, 3).map((card) =>
      card.querySelector(".card-action")!.getBoundingClientRect().top,
    ),
  );
  expect(actionTops.length).toBe(3);
  expect(
    Math.max(...actionTops) - Math.min(...actionTops),
  ).toBeLessThanOrEqual(2);
});

test("mobile short and long product cards cap visible titles at 15 characters and retain full names", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/v1/catalog/products*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [
          {
            productId: "UX-SHORT",
            name: shortName,
            categoryId: "miding",
            categoryName: "密鼎",
            pilotOrder: 1,
            tagline: "短名称展示夹具",
            coverPath: null,
          },
          {
            productId: "UX-LONG",
            name: "超长产品资料标题截断无障碍验证示例名称",
            categoryId: "miding",
            categoryName: "密鼎",
            pilotOrder: 2,
            tagline: "长名称展示夹具",
            coverPath: null,
          },
        ],
        page: { nextCursor: null },
        requestId: "requirements-ux",
      }),
    }),
  );
  await page.goto(urls.h5);
  const shortCard = page.locator(".product-card").filter({ hasText: shortName });
  const injectedLongName = "超长产品资料标题截断无障碍验证示例名称";
  await expect(shortCard).toBeVisible();
  await expect(page.locator(".product-card").nth(1)).toBeVisible();

  for (const [card, expected] of [
    [shortCard, shortName],
    [page.locator(".product-card").nth(1), injectedLongName],
  ] as const) {
    await expect(card).toHaveAttribute("aria-label", expected);
    const title = card.locator(".published-title");
    const visibleTitle = (await title.textContent())?.trim() ?? "";
    if (expected === shortName) expect(visibleTitle).toBe(expected);
    else
      expect(visibleTitle).toBe(
        Array.from(expected).slice(0, 15).join("") + "…",
      );
    const action = card.locator(".card-foot");
    await expect(action).toHaveText("了解产品");
    const alignment = await action.evaluate((node) => {
      const style = getComputedStyle(node);
      return { display: style.display, justifyContent: style.justifyContent };
    });
    expect(alignment.display).toBe("flex");
    expect(alignment.justifyContent).toBe("flex-end");
  }
});

test("material classification is required, linked, and legacy unclassified records request human review", async ({
  page,
  request,
}) => {
  const demoName = "【Demo】资料问答助手";
  const rows = (
    await json(
      request,
      "/admin/products?q=" + encodeURIComponent(demoName) + "&limit=100",
    )
  ).body.data;
  const product = rows.find((row: { name: string }) => row.name === demoName);
  expect(product, "the isolated demo:ai seed should exist").toBeTruthy();

  await page.route(
    "**/api/v1/admin/products/" +
      encodeURIComponent(product.productId) +
      "/draft",
    async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      delete body.data.content.materials[0].category;
      delete body.data.content.materials[0].subCategory;
      await route.fulfill({
        status: response.status(),
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(urls.admin);
  await page.getByLabel("搜索产品").fill(demoName);
  await page.getByRole("button", { name: "查询", exact: true }).click();
  const demoRow = page.locator("tbody tr").filter({ hasText: demoName });
  await expect(demoRow).toHaveCount(1);
  await demoRow.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("button", { name: "编辑资料", exact: true }).first().click();
  const existing = page.getByRole("dialog", { name: "编辑资料", exact: true });
  await expect(
    existing.getByText("这份旧资料尚未分类，请人工确认资料用途并选择一级、二级分类。"),
  ).toBeVisible();
  await existing.getByLabel("资料一级分类").selectOption("technical");
  await expect(existing.getByLabel("资料二级分类")).toHaveValue("");
  await expect(existing.getByLabel("资料二级分类")).toBeEnabled();
  await expect(existing.getByLabel("资料二级分类").locator("option")).toHaveText([
    "请选择二级分类",
    "白皮书",
    "技术规格",
    "使用手册",
  ]);
  await existing.getByRole("button", { name: "取消", exact: true }).click();
  const discard = page.getByRole("dialog", { name: "放弃资料编辑", exact: true });
  await discard.getByRole("button", { name: "放弃本次资料", exact: true }).click();

  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  const created = page.getByRole("dialog", { name: "添加资料", exact: true });
  await expect(created.getByLabel("版本标签")).toHaveValue("V1.0");
  await created.getByRole("button", { name: "加入本次编辑", exact: true }).click();
  await expect(created.getByRole("alert")).toContainText("请选择有效的资料一级分类和二级分类");
  await created.getByLabel("资料一级分类").selectOption("promotional");
  await expect(created.getByLabel("资料二级分类")).toHaveValue("");
  await expect(created.getByLabel("资料二级分类").locator("option")).toHaveText([
    "请选择二级分类",
    "演示文稿",
    "单页介绍",
    "视频",
  ]);
  await created.getByLabel("资料二级分类").selectOption("deck");
  await expect(created.getByLabel("资料二级分类")).toHaveValue("deck");
  await created.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .getByRole("dialog", { name: "放弃资料编辑", exact: true })
    .getByRole("button", { name: "放弃本次资料", exact: true })
    .click();
});

test("admin shows product materials owner wording and places each add-item button after its list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(urls.admin);
  await expect(
    page.getByRole("columnheader", { name: "产品资料负责人", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "负责人", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).first().click();
  await expect(page.getByLabel("产品资料负责人", { exact: true })).toBeVisible();
  await expect(page.getByLabel("能力边界", { exact: true })).toHaveCount(0);

  const groups = ["problems", "features", "scenarios"];
  for (const id of groups) {
    const section = page.locator(`#edit-${id}`);
    const addButton = section.getByRole("button", { name: /添加.+条目/ });
    await expect(addButton).toBeVisible();
    const isAfterList = await section.evaluate((node) => {
      const button = node.querySelector(".add-item-button");
      const items = [...node.querySelectorAll(".item-editor")];
      return (
        !!button &&
        (!items.length ||
          !!(
            items.at(-1)!.compareDocumentPosition(button) &
            Node.DOCUMENT_POSITION_FOLLOWING
          )) &&
        node.lastElementChild === button
      );
    });
    expect(isAfterList).toBe(true);
  }
});
