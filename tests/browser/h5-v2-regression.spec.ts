import { test, expect, urls } from './support';
import { readFile, rm } from 'node:fs/promises';
import { prepareVideoFixtures } from '../helpers/upload-fixtures';
import path from 'node:path';

const evidence = 'implementation-reports/evidence/2026-10-31/h5-v2-implementation';
test.beforeAll(async ({request}) => {
  expect(new URL(urls.api).hostname).toBe('127.0.0.1');
  expect((await (await request.get(urls.api + '/health')).json()).provider).toBe('mock');
});
for (const width of [320,390]) {
  test(`V2 live catalog, PDF and return state at ${width}px`, async ({page,request}) => {
    await page.setViewportSize({width,height:844});
    await page.goto(urls.h5);
    await expect(page.locator('.v2-series-card')).toHaveCount(4);
    const published = (await (await request.get(urls.api + '/api/v1/catalog/products?limit=100')).json()).data;
    const recommended = published.filter((item: {pilotOrder:number|null}) => item.pilotOrder != null).slice(0,6);
    await expect(page.locator('.v2-product-card')).toHaveCount(recommended.length);
    await expect(page.getByText('按系列浏览',{exact:true})).toHaveCount(0);
    const logo=await page.locator('.brand-logo').boundingBox();
    expect([logo!.width,logo!.height]).toEqual([126,42]);
    const image=page.locator('.v2-banner img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1796);
    const banner=await page.locator('.v2-banner').boundingBox();
    expect(Math.abs(banner!.height-banner!.width*876/1796)).toBeLessThan(1.1);
    const nav=await page.locator('.v2-bottom-nav').boundingBox();
    expect(nav!.height).toBe(72);
    for(const tab of await page.locator('.v2-bottom-nav uni-button').all()) {
      const icon=await tab.locator('uni-image').boundingBox(), label=await tab.locator('uni-text').boundingBox();
      expect(Math.abs(icon!.x+icon!.width/2-label!.x-label!.width/2)).toBeLessThan(1);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`${evidence}/home-${width}.png`});
    await page.screenshot({path:`${evidence}/home-full-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'搜索',exact:true}).press('Enter');
    await expect(page).toHaveURL(/pages\/products\/index/);
    await page.locator('.search input').fill('资料问答');
    await page.getByRole('button',{name:'搜索',exact:true}).click();
    await expect(page.locator('.v2-product-card')).toHaveCount(1);
    const productCard = await page.locator('.v2-product-card').boundingBox();
    const visual = await page.locator('.v2-product-card .product-visual').boundingBox();
    expect(productCard!.height).toBe(180);
    expect(visual!.width).toBe(54);
    expect(visual!.x).toBeGreaterThan(width / 2);
    await expect(page.locator('.v2-product-title')).toHaveCSS('font-size','17px');
    await page.screenshot({path:`${evidence}/products-${width}.png`});
    await page.locator('.v2-product-card').click();
    await expect(page.locator('.detail-title')).toHaveText('【Demo】资料问答助手');
    await page.screenshot({path:`${evidence}/detail-${width}.png`});
    await page.locator('.section-nav uni-button').filter({hasText:'资料'}).click();
    await expect(page.locator('#section-materials .section-title')).toBeInViewport();
    await page.locator('.material-card').filter({hasText:'资料问答助手 · 产品介绍'}).click();
    await expect(page.locator('#preview-surface canvas')).toBeVisible({timeout:30000});
    await expect(page.getByText('正在读取…',{exact:true})).not.toBeVisible();
    await page.getByRole('button',{name:'下一页',exact:true}).click();
    await expect(page.locator('.v2-page-input input')).toHaveValue('2');
    await expect(page.getByText('正在读取…',{exact:true})).not.toBeVisible();
    await page.getByRole('button',{name:'放大 +',exact:true}).click();
    await expect(page.getByText('125%',{exact:true})).toBeVisible();
    await page.locator('.v2-page-input input').fill('3');
    await page.locator('.v2-page-input input').press('Enter');
    await expect(page.getByText('正在读取…',{exact:true})).not.toBeVisible();
    await expect(page.getByRole('button',{name:'下一页',exact:true})).toHaveAttribute('disabled','true');
    await page.getByRole('button',{name:'− 缩小',exact:true}).click();
    await expect(page.getByText('正在读取…',{exact:true})).not.toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`${evidence}/pdf-${width}.png`});
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await expect(page.locator('.detail-title')).toHaveText('【Demo】资料问答助手');
    await page.getByRole('button',{name:'返回上一页',exact:true}).click();
    await expect(page.locator('.search input')).toHaveValue('资料问答');
    await page.locator('.v2-bottom-nav').getByText('资料',{exact:true}).click();
    await expect(page.locator('.v2-material-card')).toHaveCount(4);
    expect((await page.locator('.v2-material-card').first().boundingBox())!.height).toBe(156);
    await page.screenshot({path:`${evidence}/materials-${width}.png`});
    await page.locator('.v2-bottom-nav').getByText('首页',{exact:true}).click();
    await page.getByRole('button',{name:'建议反馈',exact:true}).click();
    await page.getByRole('button',{name:'提交反馈',exact:true}).click();
    await expect(page.getByText('请填写建议内容。',{exact:true})).toBeVisible();
  });
}

test('V2 video still plays and invalidates a changed release', async ({page}) => {
  const root=await prepareVideoFixtures();
  try {
    const video=await readFile(path.join(root,'video-sample.mp4'));
    let changed=false;
    await page.route('**/api/v1/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname.endsWith('/fixture-video.mp4'))return route.fulfill({contentType:'video/mp4',body:video});
      if(pathname.endsWith('/analytics'))return route.fulfill({json:{data:{viewEnabled:false,notice:''}}});
      if(pathname.endsWith('/preview'))return route.fulfill({json:{data:{productId:'video-product',materialId:'video-material',releaseId:changed?'release-2':'release-1',versionId:'video-v1',name:'【本地验证】视频',versionLabel:'v1',previewKind:'video',pageCount:1,parts:[{part:'video',mimeType:'video/mp4',path:'/api/v1/catalog/fixture-video.mp4'}]}}});
      return route.fulfill({status:404,json:{error:{code:'TEST_ONLY',message:'仅本地测试'}}});
    });
    await page.setViewportSize({width:390,height:844});
    await page.goto(urls.h5+'/#/pages/viewer/index?productId=video-product&materialId=video-material');
    const player=page.locator('video');
    await expect.poll(()=>player.evaluate(node=>(node as HTMLVideoElement).readyState)).toBeGreaterThan(0);
    await player.evaluate(async node=>{const video=node as HTMLVideoElement;video.muted=true;await video.play();});
    await expect.poll(()=>player.evaluate(node=>(node as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
    await player.evaluate(node=>(node as HTMLVideoElement).pause());
    changed=true;
    await player.evaluate(async node=>{const video=node as HTMLVideoElement;video.currentTime=0;await video.play();});
    await expect(page.getByRole('alert')).toContainText('资料已更新');
  } finally {await rm(root,{recursive:true,force:true});}
});
