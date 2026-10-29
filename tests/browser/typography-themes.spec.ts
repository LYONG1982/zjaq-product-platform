import { test, expect, urls, json } from "./support";

test("H5 detail uses the four specified series colors and indents each summary paragraph", async ({ page, request }) => {
  const products = (await json(request, "/catalog/products?limit=100")).body.data;
  const first = products.find((item: { name: string }) => item.name.includes("【验证数据】"));
  expect(first).toBeTruthy();
  const original = (await json(request, "/catalog/products/" + first.productId)).body;
  await page.setViewportSize({ width: 390, height: 844 });
  const themes = [
    ["miding", "#165dff", "rgb(22, 93, 255)"],
    ["miyi", "#2b7f71", "rgb(43, 127, 113)"],
    ["mishu", "#386aab", "rgb(56, 106, 171)"],
    ["ai", "#2b7dbe", "rgb(43, 125, 190)"],
  ];
  for (const [categoryId, accent, rgb] of themes) {
    await page.goto("about:blank");
    // Bounded visual fixture: no real products or published records are changed.
    await page.route("**/api/v1/catalog/products/" + first.productId, route => route.fulfill({ json: { ...original, data: { ...original.data, summary: "第一段  保留空格。\n\n第二段说明。", category: { id: categoryId, name: "本地主题验证" } } } }));
    await page.goto(urls.h5 + "/#/pages/detail/index?id=" + first.productId);
    const detail = page.locator(".detail-page");
    await expect(detail).toHaveCSS("--detail-accent", accent);
    await expect(page.locator(".detail-intro")).toHaveCSS("background-color", rgb);
    const paragraphs = page.locator(".product-introduction .summary");
    await expect(paragraphs).toHaveCount(2);
    await expect(paragraphs.nth(0)).toHaveText("第一段  保留空格。", { useInnerText: false });
    for (const paragraph of await paragraphs.all()) {
      await expect(paragraph).toHaveCSS("text-indent", "32px");
      const style = await paragraph.evaluate(element => { const s = getComputedStyle(element); return { margin: parseFloat(s.marginTop), line: parseFloat(s.lineHeight), white: s.whiteSpace }; });
      expect(style.margin).toBeGreaterThan(0); expect(style.line).toBeGreaterThanOrEqual(27); expect(style.white).toBe("pre-wrap");
    }
    await page.screenshot({ path: `work/round04/detail-${categoryId}.png`, fullPage: true });
    await page.unroute("**/api/v1/catalog/products/" + first.productId);
  }
});
