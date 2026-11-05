import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync, fork, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { prepareVideoFixtures } from "../helpers/upload-fixtures";

// Owns a fresh child-process API/store. Existing UAT APIs are never called.
const admin = "http://127.0.0.1:3431";
let child: ChildProcess, base: string, fixtures: string, selectedFile: string;
let sequence=0;
const waiting=new Map<number,(data:any)=>void>();
function control(action:string):Promise<any> {
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{waiting.delete(id);reject(new Error("Test child timed out"));},10000);
    waiting.set(id,data=>{clearTimeout(timeout);resolve(data);}); child.send({id,action});
  });
}
test.beforeAll(async () => {
  expect(process.env.TEST_VIDEO_RUNTIME_ISOLATED).toBe("true");
  fixtures=await prepareVideoFixtures();
  await writeFile(join(fixtures,"corrupt.mp4"),Buffer.from("0000ftypisom00000000000000000000"));
  execFileSync("ffmpeg",["-v","error","-i",join(fixtures,"video-sample.mp4"),"-c:v","mpeg4","-an","-y",join(fixtures,"unsupported.mp4")]);
  child=fork("tests/helpers/video-runtime-server.ts",[],{execArgv:["--import","tsx"],stdio:["ignore","pipe","pipe","ipc"]});
  child.on("message",(message:any)=>{if(message.id) {waiting.get(message.id)?.(message.data);waiting.delete(message.id);}});
  const ready=await new Promise<any>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("Test API startup timed out")),10000);
    child.once("message",message=>{clearTimeout(timer);resolve(message);});
    child.once("error",reject);
  });
  expect(ready.ready).toBe(true); base=ready.base;
});
test.afterAll(async () => {
  if(child?.connected) {child.disconnect(); await once(child,"exit");}
  if(fixtures) await rm(fixtures,{recursive:true,force:true});
});
test.beforeEach(async ({page,request}) => {
  // Reuse the already-built admin UI, forwarding its baked test API URL only
  // to the API owned by this spec; no traffic reaches the prior QR UAT API.
  await page.route("http://127.0.0.1:3423/**",async route => {
    const response=await route.fetch({url:route.request().url().replace("http://127.0.0.1:3423",base),
      ...(route.request().method()==="PUT" ? {postData:await readFile(join(fixtures,selectedFile))} : {})});
    await route.fulfill({response});
  });
  const name="(测试)视频运行自检"+randomUUID().slice(0,6);
  const created=await request.post(base+"/api/v1/admin/products",{headers:{Authorization:"Bearer local-admin","Idempotency-Key":randomUUID()},
    data:{name,categoryId:"miding",templateId:"software",templateVersion:1,owner:"虚构验收",model:"RUNTIME-"+randomUUID(),productType:"SOFTWARE",ownership:"SELF_DEVELOPED"}});
  expect(created.status()).toBe(200);
  await page.goto(admin); await page.getByLabel("搜索产品",{exact:true}).fill(name);
  await page.getByRole("button",{name:"查询",exact:true}).click();
  await page.getByRole("row").filter({hasText:name}).getByRole("button",{name:"编辑",exact:true}).click();
  await page.getByRole("button",{name:"上传视频",exact:true}).click();
});

test("missing tool refuses before PUT; same dialog recovers to READY, Range and actual playback",async ({page,request}) => {
  selectedFile="video-sample.mp4"; const before=await control("unavailable");
  const count=before.uploads.length; let puts=0;
  page.on("request",r=>{if(r.method()==="PUT")puts++;});
  const dialog=page.getByRole("dialog",{name:"上传视频",exact:true});
  await dialog.getByLabel("选择资料文件",{exact:true}).setInputFiles(join(fixtures,selectedFile));
  await dialog.getByRole("button",{name:"上传",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("VIDEO_PROBE_UNAVAILABLE");
  await expect(dialog.getByRole("alert")).toContainText("请求编号");
  expect(puts).toBe(0); expect((await control("inspect")).uploads.length).toBe(count);
  await page.screenshot({path:"work/video-runtime/browser-before.png",fullPage:true});
  await control("restore");
  await dialog.getByRole("button",{name:"重试上传",exact:true}).click();
  await expect(dialog.getByText("当前预览类型：视频")).toBeVisible({timeout:25000});
  expect(puts).toBe(1); const after=await control("inspect"); expect(after.uploads.length).toBe(count+1);
  const upload=after.uploads.at(-1)!; expect(upload.status).toBe("READY");
  const range=await request.get(base+`/api/v1/admin/products/${upload.productId}/assets/${upload.assetId}/content`,{headers:{Authorization:"Bearer local-admin",Range:"bytes=0-31"}});
  expect(range.status()).toBe(206); expect((await range.body()).length).toBe(32);
  await dialog.getByRole("button",{name:"检查预览件",exact:true}).click();
  const preview=page.getByRole("dialog",{name:"资料文件预览"}); const video=preview.locator("video");
  await expect(video).toBeVisible();
  await video.evaluate(async (element:HTMLVideoElement)=>{element.muted=true; await element.play();});
  await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.currentTime)).toBeGreaterThan(0.1);
  const playback=await video.evaluate((element:HTMLVideoElement)=>({currentTime:element.currentTime,readyState:element.readyState}));
  await page.screenshot({path:"work/video-runtime/browser-ready.png",fullPage:true});
  await writeFile("work/video-runtime/browser-evidence.json",JSON.stringify({isolatedSession:after.sessionId,startup:after.startup,puts,uploadStatus:upload.status,range:range.status(),playback},null,2));
});

for(const [file,code] of [["corrupt.mp4","VIDEO_CORRUPT"],["unsupported.mp4","VIDEO_CODEC_UNSUPPORTED"]]) {
  test(`healthy preflight retains full-content rejection: ${code}`,async ({page})=>{
    await control("restore"); selectedFile=file;
    const dialog=page.getByRole("dialog",{name:"上传视频",exact:true});
    await dialog.getByLabel("选择资料文件",{exact:true}).setInputFiles(join(fixtures,file));
    await dialog.getByRole("button",{name:"上传",exact:true}).click();
    await expect(dialog.getByRole("alert")).toContainText(code);
    await expect(dialog.getByRole("button",{name:"完成",exact:true})).toBeDisabled();
    expect((await control("inspect")).uploads.at(-1)?.status).toBe("REJECTED");
  });
}
