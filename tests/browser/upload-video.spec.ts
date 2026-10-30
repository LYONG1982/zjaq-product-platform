import { test, expect, urls, json, publicProductId, loginSales } from "./support";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { prepareVideoFixtures, sparsePdf } from "../helpers/upload-fixtures";
import { rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
let videoFixtures: string;
test.beforeAll(async () => { videoFixtures = await prepareVideoFixtures(); });
test.afterAll(async () => { if (videoFixtures) await rm(videoFixtures,{recursive:true,force:true}); });
async function playsVideo(video: import("@playwright/test").Locator) {
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0);
  await video.evaluate(async (element: HTMLVideoElement) => { element.muted = true; await element.play(); });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.1);
}

test("one upload entry recognises video, admin preview streams with HttpOnly media cookie, H5 and sales play latest video", async ({ page, request }) => {
  const name="【验证数据】视频闭环-"+randomUUID().slice(0,6);
  const created=(await json(request,"/admin/products","POST",{name,categoryId:"miding",templateId:"software",templateVersion:1,owner:"本地验证",model:"VIDEO-"+randomUUID(),productType:"SOFTWARE",ownership:"SELF_DEVELOPED"},randomUUID())).body.data;
  const content={...created.content,tagline:"本地视频验证",summary:"虚构蓝色视频素材",problemValues:[{id:"p",title:"验证",text:"本地测试"}],features:[{id:"f",title:"验证",text:"本地测试"}],scenarios:[{id:"s",title:"验证",text:"本地测试"}],technical:{deployment:"仅本地"}};
  expect((await json(request,"/admin/products/"+created.productId+"/draft","PATCH",{expectedDraftVersion:created.draftVersion,content})).status).toBe(200);
  const requests:string[]=[];page.on("request",r=>requests.push(r.url()));
  await page.goto(urls.admin);await page.getByLabel("搜索产品",{exact:true}).fill(name);await page.getByRole("button",{name:"查询",exact:true}).click();await page.getByRole("row").filter({hasText:name}).getByRole("button",{name:"编辑",exact:true}).click();
  await page.getByRole("button",{name:"上传资料",exact:true}).click();const dialog=page.getByRole("dialog",{name:"上传资料",exact:true});
  await dialog.locator('input[type="file"]').setInputFiles(path.join(videoFixtures,"video-sample.mp4"));
  await dialog.getByRole("button",{name:"上传",exact:true}).click();
  await expect(dialog.getByText("当前预览类型：视频")).toBeVisible({timeout:25000});await expect(dialog.getByLabel("资料名称",{exact:true})).toHaveValue("video-sample");
  await dialog.getByRole("combobox",{name:"资料一级分类",exact:true}).selectOption("promotional");await dialog.getByRole("combobox",{name:"资料二级分类",exact:true}).selectOption("video");
  await dialog.getByRole("button",{name:"检查预览件"}).click();const adminPreview=page.getByRole("dialog",{name:"资料文件预览"});await expect(adminPreview.locator("video")).toBeVisible();
  await playsVideo(adminPreview.locator("video"));
  const mediaCookie=(await page.context().cookies()).find(c=>c.name==="zj_admin_media");expect(mediaCookie?.httpOnly).toBe(true);expect(mediaCookie?.path).toBe("/api/v1/admin/products/");expect(await page.evaluate(()=>document.cookie)).not.toContain("zj_admin_media");
  await adminPreview.getByRole("button",{name:"关闭资料文件预览",exact:true}).click();await dialog.getByRole("button",{name:"完成",exact:true}).click();await page.getByRole("button",{name:"保存草稿",exact:true}).click();await expect(page.getByText(/草稿已保存/)).toBeVisible();
  await page.getByRole("button",{name:"发布",exact:true}).click();const confirm=page.getByRole("dialog",{name:"确认发布",exact:true});await confirm.getByRole("checkbox").check();await confirm.getByRole("button",{name:"确认发布",exact:true}).click();await expect(page.getByText(/发布成功/)).toBeVisible();
  const publicId=await publicProductId(request,name);const item=(await json(request,"/catalog/products/"+publicId)).body.data.materials[0];expect(item.previewKind).toBe("video");
  const h5=await page.context().newPage();await h5.goto(urls.h5+"/#/pages/viewer/index?productId="+publicId+"&materialId="+item.materialId);await expect(h5.locator("video")).toBeVisible();await playsVideo(h5.locator("video"));await h5.close();
  await loginSales(page);await page.goto(urls.portal+"/viewer?productId="+publicId+"&materialId="+item.materialId);await expect(page.getByLabel("视频资料预览")).toBeVisible();await playsVideo(page.locator("video"));
  const download=page.waitForEvent("download");await page.getByRole("link",{name:"下载资料",exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.mp4$/);
  expect(requests.every(url=>!/Bearer|access_token=|local-admin|local-mock/.test(url))).toBe(true);
});

test("browser streams a 500 MiB PDF and refuses 501 MiB locally before upload reservation", async ({page,request}) => {
  test.setTimeout(120000);
  // The shared fixture enables CDP Fetch interception for unrelated fallback
  // ports. Disable it here so Chromium does not serialize a 500 MiB postData
  // body over the automation protocol; production traffic goes directly to API.
  await page.unrouteAll({ behavior: "wait" });
  if (process.env.TEST_UPLOAD_FORCE_FETCH === "true") await page.addInitScript(() => { (window as any).XMLHttpRequest = undefined; });
  const root=await mkdtemp(path.join(tmpdir(),"zj-browser-500m-"));
  try {
    const name="【验证数据】500MiB-"+randomUUID().slice(0,6);
    const created=(await json(request,"/admin/products","POST",{name,categoryId:"miding",templateId:"software",templateVersion:1,owner:"本地验证",model:"BIG-"+randomUUID(),productType:"SOFTWARE",ownership:"SELF_DEVELOPED"},randomUUID())).body.data;
    await page.goto(urls.admin);await page.getByLabel("搜索产品",{exact:true}).fill(name);await page.getByRole("button",{name:"查询",exact:true}).click();await page.getByRole("row").filter({hasText:name}).getByRole("button",{name:"编辑",exact:true}).click();
    await page.getByRole("button",{name:"上传资料",exact:true}).click();const dialog=page.getByRole("dialog",{name:"上传资料",exact:true});
    const large=path.join(root,"500MiB.pdf");await sparsePdf(large,500*1024*1024);await dialog.locator('input[type="file"]').setInputFiles(large);
    await dialog.getByRole("button",{name:"上传",exact:true}).click();await expect(dialog.getByText("PDF 已就绪 · 1 页")).toBeVisible({timeout:60000});
    await dialog.getByRole("combobox",{name:"资料一级分类",exact:true}).selectOption("promotional");await dialog.getByRole("combobox",{name:"资料二级分类",exact:true}).selectOption("onepager");
    await dialog.getByRole("button",{name:"完成",exact:true}).click();await page.getByRole("button",{name:"保存草稿",exact:true}).click();await expect(page.getByText(/草稿已保存/)).toBeVisible();
    const saved=(await json(request,"/admin/products/"+created.productId+"/draft")).body.data;expect(saved.content.materials[0].preview.kind).toBe("pdf");
    await page.getByRole("button",{name:"上传资料",exact:true}).click();const next=page.getByRole("dialog",{name:"上传资料",exact:true});let requests=0;page.on("request",r=>{if(r.method()==="POST"&&r.url().endsWith("/admin/uploads"))requests++;});
    const tooLarge=path.join(root,"501MiB.pdf");await sparsePdf(tooLarge,501*1024*1024);await next.locator('input[type="file"]').setInputFiles(tooLarge);await expect(next.getByRole("alert")).toContainText("单个文件不能超过 500 MiB");expect(requests).toBe(0);
  } finally {await rm(root,{recursive:true,force:true});}
});
