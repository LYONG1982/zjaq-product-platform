import { test, expect, urls } from "./support";
import { loginSales } from "./support";
test.beforeEach(async ({ page }) => { await loginSales(page); });
test("series selection supplies a series icon while product covers remain optional", async ({ page }) => {
  await page.goto(urls.admin); await page.getByRole("button", { name: "新增产品", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新增产品" });
  const icon = dialog.locator(".series-selection-icon img");
  await expect(icon).toHaveAttribute("src", "/series/miding.png");
  await dialog.getByRole("combobox", { name: "产品分类" }).selectOption("miyi");
  await expect(icon).toHaveAttribute("src", "/series/miyi.png");
  await expect(dialog.getByText("已自动匹配密翼系列图标")).toBeVisible();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.goto(urls.portal + "/products?q=" + encodeURIComponent("【Demo】资料问答助手"));
  const card = page.locator(".product-card").filter({ hasText: "【Demo】资料问答助手" });
  await expect(card.locator('img[src="/series/ai.png"]')).toBeVisible();
  expect(await card.locator('img[src="/series/ai.png"]').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});
