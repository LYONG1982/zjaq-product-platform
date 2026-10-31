import { test, expect, urls } from './support';
import type { Page } from '@playwright/test';

const ids = ['mishu', 'ai', 'miyi', 'miding', '__proto__'];
const names: Record<string, string> = { miding: '密鼎', miyi: '密翼', mishu: '密塾', ai: 'AI+' };
const title = '【排版验证】跨部门保密资料管理与协同应用产品';
const description = '用于验证两行以上标题与简介的自然换行，保留完整内容。';
async function fixture(page: Page) {
  await page.route('**/api/v1/catalog/**', route => {
    expect(route.request().method()).toBe('GET');
    const u = new URL(route.request().url());
    const reply = (data: unknown) => route.fulfill({ json: { data, page: { nextCursor: null }, requestId: 'v3-readonly-fixture' } });
    if (u.pathname.endsWith('/categories')) return reply(ids.map((id, i) => ({ id, name: Object.hasOwn(names, id) ? names[id] : '未知系列', shortName: id, sortOrder: i, productCount: id === 'mishu' ? 0 : 1 })));
    if (u.pathname.endsWith('/products')) {
      const data = ids.map((id, i) => ({ productId: 'v3-' + i, releaseId: 'v3-release-' + i, releaseSequence: 1, publishedAt: '2026-10-31T00:00:00Z', name: id === '__proto__' ? 'AI+字样的未知分类产品' : title, tagline: description, categoryId: id, categoryName: '真实分类名称', coverPath: null, pilotOrder: 1 }));
      return reply(data.filter(item => (!u.searchParams.get('categoryId') || item.categoryId === u.searchParams.get('categoryId')) && (!u.searchParams.get('q') || item.name.includes(u.searchParams.get('q')!))));
    }
    if (u.pathname.endsWith('/site-contact')) return reply({ version: 1, officialQr: null, serviceQr: null, phone: null });
    if (u.pathname.endsWith('/analytics')) return reply({ viewEnabled: false, notice: '' });
    if (u.pathname.endsWith('/site-banner/default-image')) return route.fulfill({ contentType: 'image/png', path: 'services/domain/assets/default-banner.png' });
    if (u.pathname.endsWith('/site-banner')) return reply({ version: 1, imageData: null, link: null, items: [{ id: 'default', isDefault: true, imagePath: '/api/v1/catalog/site-banner/default-image', imageData: null, link: null, startsAt: null, endsAt: null }], introduction: '', introLink: null, refreshAfterSeconds: 30 });
    return route.fulfill({ status: 404, json: { error: { code: 'LOCAL_FIXTURE', message: '只读验证' } } });
  });
}
for (const width of [320, 390, 430, 1440]) test(`V3 explicit series mapping and full long content at ${width}px`, async ({ page }, info) => {
  await fixture(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(urls.h5 + '/#/pages/products/index');
  const cards = page.locator('.v2-product-card');
  await expect(cards).toHaveCount(5);
  for (const [index, id] of ids.entries()) {
    const card = cards.nth(index);
    const image = card.locator('.v3-series-artwork img');
    if (id === '__proto__') await expect(image).toHaveCount(0);
    else {
      await card.scrollIntoViewIfNeeded();
      await expect(image).toHaveAttribute('src', `/static/h5/series-v3/${id}.webp`);
      await expect.poll(() => image.evaluate(n => (n as HTMLImageElement).naturalWidth)).toBe(1774);
    }
    await expect(card.locator('.v2-product-description')).toHaveText(description);
    const bounds = await card.boundingBox(), text = await card.locator('.v2-product-title').boundingBox();
    expect(text!.x + text!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width * .55 + 1);
    expect(await card.evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    expect(await card.locator('.v2-product-title').evaluate(n => n.scrollWidth <= n.clientWidth + 1)).toBe(true);
    await expect(card.locator('.v2-product-title')).toHaveCSS('white-space', 'normal');
  }
  await expect(page.locator('.v2-series-badge,.v2-hero-icon,.v2-product-card .series-icon')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`v3-long-${width}.png`), fullPage: true });
  await page.goto(urls.h5);
  await expect(page.locator('.v2-series-card').filter({ hasText: '密塾' }).locator('.v2-series-count')).toHaveText('0 款产品');
});

test('V3 artwork failure retains interaction and switching series resets the theme', async ({ page }, info) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/series-v3/ai.webp', route => route.abort());
  await page.goto(urls.h5 + '/#/pages/products/index');
  const ai = page.locator('.v2-product-card').nth(1);
  await ai.scrollIntoViewIfNeeded();
  await expect(ai.locator('.v3-series-artwork img')).toHaveCount(0);
  await expect(ai.locator('.v2-product-title')).toHaveText(title);
  await expect(ai.locator('.v2-product-action')).toBeVisible();
  await page.screenshot({ path: info.outputPath('v3-image-failed.png') });
  await page.unroute('**/series-v3/ai.webp');
  for (const id of ['miding', 'miyi', 'mishu', 'ai', '__proto__']) {
    await page.goto(urls.h5);
    const label = Object.hasOwn(names, id) ? names[id] : '未知系列';
    await page.locator('.v2-series-card').filter({ has: page.locator('.v2-series-name', { hasText: label }) }).click();
    await expect(page.locator('.v2-series-hero')).toHaveCount(0);
    await expect(page.locator('.v2-page-subtitle')).toHaveCount(0);
    await expect(page.locator('.v2-section-head')).toContainText(label);
    const image = page.locator('.v2-product-card .v3-series-artwork img');
    if (id === '__proto__') await expect(image).toHaveCount(0);
    else {
      await expect(image).toHaveAttribute('src', `/static/h5/series-v3/${id}.webp`);
      await expect.poll(() => image.evaluate(n => (n as HTMLImageElement).naturalWidth)).toBe(1774);
    }
  }
});

for (const width of [320, 390, 430, 1440]) test(`H5 series lists keep search and navigation without Banner at ${width}px`, async ({ page }, info) => {
  await fixture(page);
  await page.setViewportSize({ width, height: 844 });
  for (const id of ['miding', 'miyi', 'mishu', 'ai', '__proto__']) {
    const label = Object.hasOwn(names, id) ? names[id] : '未知系列';
    await page.goto(urls.h5);
    await expect(page.locator('.v2-banner')).toBeVisible();
    await page.locator('.v2-series-card').filter({ has: page.locator('.v2-series-name', { hasText: label }) }).click();
    await expect(page.locator('.v2-series-hero')).toHaveCount(0);
    await expect(page.locator('.v2-page-subtitle')).toHaveCount(0);
    await expect(page.locator('.v2-section-head')).toContainText(label);
    const search = page.locator('.v2-search');
    await expect(search).toBeInViewport();
    expect((await search.boundingBox())!.y).toBeCloseTo(76, 0);
    const card = page.locator('.v2-product-card');
    await expect(card).toHaveCount(1);
    await expect(card).toBeInViewport();
    expect((await page.locator('.v2-section-head').boundingBox())!.y).toBeCloseTo(156, 0);
    expect((await card.boundingBox())!.y).toBeCloseTo(208, 0);
    await search.locator('input').fill('不存在的产品');
    await search.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.locator('.v2-empty')).toContainText('没有找到相关内容');
    await search.getByRole('button', { name: '清空搜索', exact: true }).click();
    await expect(card).toHaveCount(1);
    await expect(page.locator('.v2-series-hero')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (id === 'miding') await page.screenshot({ path: info.outputPath(`no-banner-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '← 产品一览', exact: true }).click();
    await expect(page.locator('.v2-filters')).toBeVisible();
    await expect(page.locator('.v2-product-card')).toHaveCount(5);
    await expect(page.locator('.v2-series-hero')).toHaveCount(0);
    await expect(page.locator('.v2-page-subtitle')).toBeVisible();
  }
});

test('H5 live series list keeps detail Banner and search return state', async ({ page, request }, info) => {
  expect((await (await request.get(urls.api + '/health')).json()).provider).toBe('mock');
  const response = await request.get(urls.api + '/api/v1/catalog/products?limit=100');
  expect(response.ok()).toBe(true);
  const product = (await response.json()).data.find((item: { categoryId: string }) => item.categoryId === 'miding');
  expect(product, 'local UAT should contain a published miding validation product').toBeTruthy();
  const mutations: string[] = [];
  await page.route('**/api/v1/**', route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      mutations.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.fallback();
  });
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(urls.h5);
    await page.locator('.v2-series-card').filter({ has: page.locator('.v2-series-name', { hasText: '密鼎' }) }).click();
    await expect(page.locator('.v2-series-hero')).toHaveCount(0);
    await expect(page.locator('.v2-section-head')).toContainText('密鼎');
    expect((await page.locator('.v2-search').boundingBox())!.y).toBeCloseTo(76, 0);
    await page.screenshot({ path: info.outputPath(`uat-list-${width}.png`), fullPage: true });
    await page.locator('.v2-search input').fill(product.name);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.locator('.v2-product-card')).toHaveCount(1);
    await page.locator('.v2-product-card').click();
    await expect(page.locator('.detail-title')).toHaveText(product.name);
    await expect(page.locator('.v2-series-hero')).toBeVisible();
    await expect(page.locator('.v2-hero-name')).toHaveText('密鼎');
    await page.getByRole('button', { name: '返回上一页', exact: true }).click();
    await expect(page.locator('.v2-search input')).toHaveValue(product.name);
    await expect(page.locator('.v2-section-head')).toContainText('密鼎');
    await expect(page.locator('.v2-series-hero')).toHaveCount(0);
    await page.locator('.v2-search').getByRole('button', { name: '清空搜索', exact: true }).click();
  }
  await page.goto(urls.h5);
  await page.locator('.v2-series-card').filter({ has: page.locator('.v2-series-name', { hasText: '密塾' }) }).click();
  await expect(page.locator('.v2-series-hero')).toHaveCount(0);
  await expect(page.locator('.v2-empty')).toContainText('没有找到相关内容');
  expect(mutations).toEqual([]);
});
