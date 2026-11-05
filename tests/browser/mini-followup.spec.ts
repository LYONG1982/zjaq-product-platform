import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

const evidence = "work/mini-followup-20261105";
const admin = process.env.TEST_ADMIN_URL ?? "http://127.0.0.1:3401";
const api = process.env.TEST_API_URL ?? "http://127.0.0.1:3403";

test("#11 compiled mini-program render hides the home brand row and preserves other pages", async ({}, testInfo) => {
  const base = "apps/mobile/dist/build/mp-weixin/components/CatalogView";
  const [code, template] = await Promise.all([readFile(base + ".js", "utf8"), readFile(base + ".wxml", "utf8")]);
  const brandTag = template.match(/<view\b[^>]*class="brand-row\b[^>]*>/)?.[0];
  expect(brandTag).toBeTruthy();
  const condition = brandTag!.match(/wx:if="\{\{([a-zA-Z0-9_]+)\}\}"/)?.[1];
  expect(condition, "native brand row must have a rendering condition").toBeTruthy();
  expect(template).toContain('class="home-banner');
  let component: any;
  // Execute the actual native render output. Lifecycle/network hooks are intentionally
  // inert: this checks WXML binding behavior, not a WeChat device or backend.
  const vendor = {
    defineComponent: (value: unknown) => value,
    ref: (value: unknown) => ({ value }),
    computed: (fn: () => unknown) => ({ get value() { return fn(); } }),
    onMounted() {}, onUnmounted() {},
    e: Object.assign,
    f: (items: any[], fn: (item: any, index: number, key: string) => unknown) => items.map((item, index) => fn(item, index, String(index))),
    t: String, n: (value: unknown) => value, o: (value: unknown) => value,
    p: (value: unknown) => value, sr: () => undefined,
    unref: (value: any) => value?.value ?? value,
    _export_sfc: (value: unknown) => value,
  };
  const modules: Record<string, unknown> = {
    "../common/vendor.js": vendor,
    "../api.js": {},
    "../series-display.js": { seriesIds: ["miding", "miyi", "mishu", "ai"], seriesName: (id: string) => id },
    "../navigation.js": { catalogState: Object.fromEntries(["home", "products", "materials"].map(kind => [kind, { q: "", category: "", scroll: 0, count: 0 }])) },
    "../site-images.js": {},
  };
  runInNewContext(code, { require: (name: string) => {
    expect(name in modules).toBeTruthy();
    return modules[name];
  }, wx: { createComponent: (value: unknown) => { component = value; } } });
  const states: Record<string, boolean> = {};
  for (const kind of ["home", "products", "materials"]) {
    const render = component.setup({ kind }, { expose() {} });
    const bindings = render({ kind }, {});
    states[kind] = bindings[condition!];
    expect(states[kind]).toBe(kind !== "home");
  }
  await testInfo.attach("native-render-conditions", { body: JSON.stringify(states), contentType: "application/json" });
});

for (const width of [1280, 1440]) {
  for (const longNames of [false, true]) {
    test(`#17 eight series at ${width}px (${longNames ? "long" : "normal"} names), browser-only fixtures`, async ({ page }, testInfo) => {
      expect(admin).toBe("http://127.0.0.1:3401");
      expect(api).toBe("http://127.0.0.1:3403");
      await page.setViewportSize({ width, height: 900 });
      const writes: string[] = [];
      const filters: string[] = [];
      await page.route("**/api/**", async route => {
        const request = route.request();
        const url = new URL(request.url());
        expect(url.origin).toBe(api);
        if (request.method() !== "GET") {
          writes.push(request.method() + " " + url.pathname);
          await route.abort("blockedbyclient");
          return;
        }
        if (url.pathname === "/api/v1/admin/categories") {
          const response = await route.fetch();
          const body = await response.json();
          expect(body.data).toHaveLength(4);
          body.data = [...body.data, ...Array.from({ length: 4 }, (_, i) => ({
            ...body.data[0],
            id: `browser-only-${i + 5}`,
            shortName: longNames ? `验证专用扩展产品系列${i + 5}长名称横向滚动检查` : `验证系列${i + 5}`,
            name: `浏览器临时验证系列${i + 5}`,
            sortOrder: i + 5,
          }))];
          await route.fulfill({ response, json: body });
          return;
        }
        if (url.pathname === "/api/v1/admin/products") {
          filters.push(url.searchParams.get("categoryId") ?? "");
          if (url.searchParams.get("categoryId")?.startsWith("browser-only-")) {
            await route.fulfill({ json: { data: [], page: { nextCursor: null } } });
            return;
          }
        }
        await route.continue();
      });
      await page.goto(admin);
      const tabs = page.getByRole("navigation", { name: "产品系列" });
      const buttons = tabs.getByRole("button");
      await expect(buttons).toHaveCount(9);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      const baseline = await page.locator(".sidebar, .table-card table").evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width })));
      const row = await buttons.evaluateAll(elements => elements.map(el => ({ y: el.getBoundingClientRect().y, height: el.getBoundingClientRect().height })));
      for (const box of row) {
        expect(Math.abs(box.y - row[0].y)).toBeLessThan(1);
        expect(box.height).toBe(row[0].height);
      }
      const sizes = await tabs.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
      if (longNames) expect(sizes.scroll).toBeGreaterThan(sizes.client);
      const currentUrl = page.url();
      const historyLength = await page.evaluate(() => history.length);
      const first = buttons.first(), last = buttons.last();
      await first.focus();
      for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
      await expect(last).toBeFocused();
      await expect(page.locator("thead th")).toHaveText(["编号", "产品名称", "分类", "产品资料负责人", "状态", "更新时间", "操作"]);
      expect(await page.locator(".sidebar, .table-card table").evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width })))).toEqual(baseline);
      await page.keyboard.press("Enter");
      await expect(last).toHaveAttribute("aria-current", "true");
      await expect.poll(() => filters.at(-1)).toBe("browser-only-8");
      await expect(page.locator("tbody tr")).toHaveCount(0);
      await expect(page.getByText("没有符合条件的产品", { exact: true })).toBeVisible();
      const end = await last.boundingBox(), bounds = await tabs.boundingBox();
      expect(end!.x).toBeGreaterThanOrEqual(bounds!.x - 1);
      expect(end!.x + end!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
      if (longNames) expect(await tabs.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && scrollX === 0)).toBeTruthy();
      expect(page.url()).toBe(currentUrl);
      expect(await page.evaluate(() => history.length)).toBe(historyLength);
      await page.screenshot({ path: join(evidence, `admin-series-${width}-${longNames ? "long" : "normal"}.png`), fullPage: true });
      // Mouse activation can also reveal the first and last entries without shifting the page.
      await first.click();
      await expect(first).toHaveAttribute("aria-current", "true");
      await expect(page.locator("tbody tr").first()).toBeVisible();
      expect(await page.locator(".sidebar, .table-card table").evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width })))).toEqual(baseline);
      await last.click();
      await expect(last).toHaveAttribute("aria-current", "true");
      expect(writes).toEqual([]);
      await testInfo.attach("layout-evidence", { body: JSON.stringify({ width, series: 8, longNames, sizes, row, end, bounds, filters, writes }), contentType: "application/json" });
    });
  }
}

test("#07 compiled WXSS keeps tabs pinned during scroll at 320px and 390px (browser CSS check)", async ({ page }, testInfo) => {
  const css = await readFile("apps/mobile/dist/build/mp-weixin/components/CatalogView.wxss", "utf8");
  const scope = css.match(/\.category-wrap\.(data-v-[a-z0-9]+)/)?.[1];
  expect(scope).toBeTruthy();
  await page.setContent(`<main class="mobile-body ${scope}"><div class="mobile-hero ${scope}" style="height:200px">产品中心</div><nav class="category-wrap ${scope}"><div style="height:44px">全部　密鼎　密翼　密塾　AI+</div></nav><div style="height:1600px">滚动验证占位</div></main>`);
  await page.addStyleTag({ content: css });
  const tabs = page.locator(".category-wrap");
  const positions: unknown[] = [];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    await page.evaluate(() => scrollTo(0, 0));
    await expect(tabs).toHaveCSS("position", "sticky");
    expect((await tabs.boundingBox())!.y).toBeGreaterThan(100);
    for (const y of [350, 700]) {
      await page.evaluate(value => scrollTo(0, value), y);
      await expect.poll(async () => (await tabs.boundingBox())!.y).toBe(0);
      positions.push({ width, scroll: y, box: await tabs.boundingBox() });
    }
  }
  await testInfo.attach("compiled-wxss-scroll", { body: JSON.stringify(positions), contentType: "application/json" });
});

test("H5 retains the brand Banner and five in-place series tabs without data writes", async ({ page }) => {
  const h5 = process.env.TEST_H5_URL ?? "http://127.0.0.1:3402";
  expect(h5).toBe("http://127.0.0.1:3402");
  const writes: string[] = [];
  await page.route("**/api/**", async route => {
    expect(new URL(route.request().url()).origin).toBe(api);
    if (route.request().method() !== "GET") {
      writes.push(route.request().method() + " " + route.request().url());
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(h5 + "/#/pages/home/index");
  await expect(page.locator(".home-banner")).toBeVisible();
  await expect(page.locator(".v2-brand-row, .brand-row")).toHaveCount(0);
  await page.screenshot({ path: join(evidence, "h5-home-preserved.png"), fullPage: true });
  await page.goto(h5 + "/#/pages/products/index");
  const tabs = page.locator(".v2-filters");
  await expect(tabs.getByRole("button")).toHaveCount(5);
  await expect(tabs).toHaveCSS("position", "sticky");
  const currentUrl = page.url();
  await tabs.getByRole("button", { name: "密鼎", exact: true }).click();
  await expect(tabs.getByRole("button", { name: "密鼎", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(page.url()).toBe(currentUrl);
  await page.getByLabel("搜索产品", { exact: true }).locator("input").fill("补验无匹配内容");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await expect(page.getByText("没有找到相关内容", { exact: true })).toBeVisible();
  await expect(tabs.getByRole("button")).toHaveCount(5);
  await expect(tabs.getByRole("button", { name: "密鼎", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: join(evidence, "h5-tabs-preserved.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(writes).toEqual([]);
});
