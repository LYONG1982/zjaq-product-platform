import { test, expect, urls, json } from "./support";

const publicSeriesIds = ["miding", "miyi", "mishu", "ai"];

test("mobile home shows the four public series, including zero-count series, and opens each category", async ({
  page,
  request,
}) => {
  const categories = (await json(request, "/catalog/categories")).body.data;
  const series = publicSeriesIds.map((id) =>
    categories.find((category: { id: string }) => category.id === id),
  );
  expect(series.every(Boolean)).toBe(true);
  expect(series).toHaveLength(4);
  const emptySeries = series.find(
    (category: { productCount: number }) => category.productCount === 0,
  );
  expect(emptySeries, "seeded Mock data should include a zero-count series").toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const category of series as Array<{
    id: string;
    name: string;
    productCount: number;
  }>) {
    await page.goto(urls.h5);
    const cardName = `${category.name}，${category.productCount} 款产品，查看系列`;
    const card = page.getByRole("button", { name: cardName, exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText(`${category.productCount} 款产品`);
    await card.click();

    await expect(page.locator(".category-row .selected")).toHaveText(
      category.name,
    );
    if (category.productCount === 0) {
      await expect(page.getByText("没有找到相关内容", { exact: true })).toBeVisible();
    } else {
      await expect(page.locator(".product-card").first()).toBeVisible();
    }
  }
});

test("admin filters seeded fictional products by owner and resets without changing data", async ({
  page,
  request,
}) => {
  const owner = "本地虚构验证人员";
  const filtered = (
    await json(
      request,
      "/admin/products?owner=" + encodeURIComponent(owner) + "&limit=100",
    )
  ).body.data;
  expect(filtered.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(urls.admin);
  const ownerFilter = page.getByLabel("产品资料负责人筛选", { exact: true });
  await ownerFilter.fill(owner);
  await page.getByRole("button", { name: "查询", exact: true }).click();

  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(filtered.length);
  for (const row of await rows.all()) {
    await expect(row.locator("td").nth(3)).toHaveText(owner);
  }

  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(ownerFilter).toHaveValue("");
  await expect(page.getByRole("row", { name: /保密工作管理系统/ })).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(filtered.length);
});
