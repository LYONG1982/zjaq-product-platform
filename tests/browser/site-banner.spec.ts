import { test, expect, urls } from "./support";
import path from "node:path";

// Writes only to the isolated test API started explicitly for this suite.
test.beforeAll(async ({ request }) => {
  expect(new URL(urls.api).hostname).toBe('127.0.0.1');
  expect((await (await request.get(urls.api + '/health')).json()).provider).toBe('mock');
});

test("protected default first page survives admin additions, links and custom deletion", async ({ page, request }) => {
  const headers={Authorization:'Bearer local-admin'};
  const before=(await (await request.get(urls.api+'/api/v1/admin/site-banner',{headers})).json()).data;
  await page.goto(urls.admin);
  await page.getByRole("button", { name: "系统设置", exact: false }).click();
  const settings = page.locator(".banner-settings");
  const first = settings.locator('.banner-item').first();
  await expect(first).toContainText('默认首张');
  await expect(first.getByRole('button', {name:'删除自定义页'})).toHaveCount(0);
  await expect(first.locator('img')).toBeVisible();
  expect(await first.locator('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1796);
  await settings.getByRole('button', {name:'新增自定义 Banner', exact:true}).click();
  const custom = settings.locator('.banner-item').last();
  await custom.getByLabel('上传或替换图片').setInputFiles(path.resolve('tests/fixtures/validation/page-1.png'));
  await custom.getByLabel('跳转链接（可选）', {exact:true}).fill('/pages/products/index');
  await settings.getByLabel('介绍文字（可选）', {exact:true}).fill('本地隔离验证：介绍位');
  await settings.getByRole('button', {name:'保存 Banner 列表',exact:true}).click();
  await expect(settings.getByRole('status')).toHaveText('Banner 列表已保存。');
  const mobile = await page.context().newPage();
  await mobile.setViewportSize({width:390,height:844});
  await mobile.goto(urls.h5);
  await expect(mobile.getByAltText('中技安全产品资料库品牌 Banner',{exact:true})).toBeVisible();
  await expect(mobile.locator('.v2-banner-dots uni-button')).toHaveCount(2);
  const b = await mobile.locator('.v2-banner').boundingBox(), s = await mobile.locator('.v2-search').boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(s!.y);
  await mobile.getByRole('button',{name:'第2张 Banner',exact:true}).click();
  await expect(mobile.getByAltText('自定义 Banner',{exact:true})).toBeVisible();
  expect(Math.abs((await mobile.locator('.v2-banner').boundingBox())!.height-b!.height)).toBeLessThan(1);
  await mobile.locator('.v2-banner > uni-view[role="button"]').click();
  await expect(mobile.locator('.v2-page-title')).toHaveText('产品一览');
  await mobile.close();
  page.once('dialog', dialog => dialog.accept());
  await custom.getByRole('button',{name:'删除自定义页',exact:true}).click();
  await settings.getByRole('button',{name:'保存 Banner 列表',exact:true}).click();
  await expect(settings.getByRole('status')).toHaveText('Banner 列表已保存。');
  await expect(settings.locator('.banner-item')).toHaveCount(1);
  const current = (await (await request.get(urls.api + '/api/v1/catalog/site-banner')).json()).data;
  expect(current.items.map((item: {id:string}) => item.id)).toEqual(['default']);
  const restored=await request.put(urls.api+'/api/v1/admin/site-banner',{headers,data:{expectedVersion:current.version,items:[{id:'default',imageData:null,link:null,startsAt:null,endsAt:null}],introduction:before.introduction,introLink:before.introLink}});
  expect(restored.status()).toBe(200);
});

test("scheduled custom slides appear and expire without removing default or keeping stale links", async ({ page, request }) => {
  const endpoint=urls.api+'/api/v1/admin/site-banner', headers={Authorization:'Bearer local-admin'};
  const previous=(await (await request.get(endpoint,{headers})).json()).data;
  const {readFile}=await import('node:fs/promises');
  const imageData='data:image/png;base64,'+(await readFile('tests/fixtures/validation/page-1.png')).toString('base64');
  const now=Date.now();
  try {
    const response=await request.put(endpoint,{headers,data:{expectedVersion:previous.version,items:[{id:'default',imageData:null,link:null,startsAt:null,endsAt:null},{id:'scheduled',imageData,link:'/pages/products/index',startsAt:new Date(now+3000).toISOString(),endsAt:new Date(now+7000).toISOString()}]}});
    expect(response.status()).toBe(200);
    await page.goto(urls.h5);
    await expect(page.getByAltText('中技安全产品资料库品牌 Banner',{exact:true})).toBeVisible();
    await expect(page.locator('.v2-banner-dots uni-button')).toHaveCount(0);
    await expect(page.locator('.v2-banner-dots uni-button')).toHaveCount(2,{timeout:6000});
    await page.getByRole('button',{name:'第2张 Banner',exact:true}).click();
    await expect(page.locator('.v2-banner > uni-view[role="button"]')).toHaveCount(1);
    await expect(page.locator('.v2-banner-dots uni-button')).toHaveCount(0,{timeout:6000});
    await expect(page.getByAltText('中技安全产品资料库品牌 Banner',{exact:true})).toBeVisible();
    await expect(page.locator('.v2-banner > uni-view[role="button"]')).toHaveCount(0);
  } finally {
    const latest=(await (await request.get(endpoint,{headers})).json()).data;
    const {version,refreshAfterSeconds,items,...rest}=previous;
    await request.put(endpoint,{headers,data:{expectedVersion:latest.version,items:items.map(({id,imageData,link,startsAt,endsAt}: {id:string,imageData:string|null,link:string|null,startsAt:string|null,endsAt:string|null})=>({id,imageData,link,startsAt,endsAt})),introduction:rest.introduction,introLink:rest.introLink}});
  }
});
