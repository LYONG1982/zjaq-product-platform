import { test, expect, urls, json } from "./support";
import { randomUUID } from "node:crypto";
import { prepareVideoFixtures } from "../helpers/upload-fixtures";
import { rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

let fixtures: string;
test.beforeAll(async () => {
  expect(urls.api).toBe("http://127.0.0.1:3413");
  expect(urls.admin).toBe("http://127.0.0.1:3411");
  fixtures = await prepareVideoFixtures();
  await writeFile(join(fixtures,"disguised.mp4"),"not a real MP4");
  await writeFile(join(fixtures,"unsupported.avi"),"unsupported file");
  execFileSync("ffmpeg",["-v","error","-i",join(fixtures,"video-sample.mp4"),"-c:v","mpeg4","-pix_fmt","yuv420p","-an","-y",join(fixtures,"unsupported-codec.mp4")]);
});
test.afterAll(async () => { if (fixtures) await rm(fixtures,{recursive:true,force:true}); });
test.beforeEach(async ({ page, request }) => {
  await page.unrouteAll({behavior:"wait"});
  const name="(测试)视频错误"+randomUUID().slice(0,6);
  const created=await json(request,"/admin/products","POST",{name,categoryId:"miding",templateId:"software",templateVersion:1,owner:"虚构验收",model:"ERROR-"+randomUUID(),productType:"SOFTWARE",ownership:"SELF_DEVELOPED"},randomUUID());
  expect(created.status).toBe(200);
  await page.goto(urls.admin);
  await page.getByLabel("搜索产品",{exact:true}).fill(name);
  await page.getByRole("button",{name:"查询",exact:true}).click();
  await page.getByRole("row").filter({hasText:name}).getByRole("button",{name:"编辑",exact:true}).click();
  await page.getByRole("button",{name:"上传视频",exact:true}).click();
});

for (const [file, code] of [["disguised.mp4","VIDEO_CONTAINER_MISMATCH"],["unsupported-codec.mp4","VIDEO_CODEC_UNSUPPORTED"]]) {
  test(`real file rejection displays ${code}, remedy and request ID`,async ({page}) => {
    const dialog=page.getByRole("dialog",{name:"上传视频",exact:true});
    await dialog.getByLabel("选择资料文件",{exact:true}).setInputFiles(join(fixtures,file));
    await dialog.getByRole("button",{name:"上传",exact:true}).click();
    const error=dialog.getByRole("alert");
    await expect(error).toContainText(code);
    await expect(error).toContainText("下一步：");
    await expect(error).toContainText("请求编号");
    if(code==="VIDEO_CODEC_UNSUPPORTED") await expect(error).toContainText("MPEG4");
    await expect(dialog.getByRole("button",{name:"重试上传",exact:true})).toBeVisible();
    await expect(dialog.getByRole("button",{name:"完成",exact:true})).toBeDisabled();
    await expect(error).not.toContainText(/\/Users\/|mock-assets|Cannot read|Unexpected token/);
    await error.scrollIntoViewIfNeeded();
    await expect(error.getByRole("button",{name:"复制问题详情",exact:true})).toBeVisible();
    await error.screenshot({path:`work/video-followup-20261105/${code}-message.png`});
    await page.screenshot({path:`work/video-followup-20261105/${code}.png`,fullPage:true});
  });
}

test("unsupported extension is explained before an upload task is created",async ({page}) => {
  let intents=0;page.on("request",request=>{if(request.method()==="POST"&&request.url().endsWith("/admin/uploads"))intents++;});
  const dialog=page.getByRole("dialog",{name:"上传视频",exact:true});
  await dialog.getByLabel("选择资料文件",{exact:true}).setInputFiles(join(fixtures,"unsupported.avi"));
  await expect(dialog.getByRole("alert")).toContainText("格式不支持");
  expect(intents).toBe(0);
});

for (const status of [413,502,503]) {
  test(`HTML gateway ${status} retains its reason even when status recovery fails`,async ({page}) => {
    let failed=false;
    await page.route("**/api/v1/admin/uploads/**",async route=>{
      if(route.request().method()==="PUT") {
        failed=true;
        await route.fulfill({status,headers:{"Content-Type":"text/html","Access-Control-Allow-Origin":urls.admin,"Access-Control-Expose-Headers":"X-Request-Id","X-Request-Id":"gateway-first-"+status},body:"<html>PRIVATE_PROXY_PATH</html>"});
      } else if (failed && route.request().method()==="GET") {
        await route.fulfill({status:503,json:{error:{code:"SERVER_UNAVAILABLE",message:"SECONDARY_STATUS_FAILURE"},requestId:"secondary"}});
      } else await route.continue();
    });
    const dialog=page.getByRole("dialog",{name:"上传视频",exact:true});
    await dialog.getByLabel("选择资料文件",{exact:true}).setInputFiles(join(fixtures,"video-sample.mp4"));
    await dialog.getByRole("button",{name:"上传",exact:true}).click();
    const error=dialog.getByRole("alert");
    await expect(error).toContainText(status===413?"FILE_TOO_LARGE":"SERVER_UNAVAILABLE");
    await expect(error).toContainText("gateway-first-"+status);
    await expect(error).toContainText("下一步：");
    await expect(error).not.toContainText(/PRIVATE_PROXY_PATH|SECONDARY_STATUS_FAILURE|Cannot read|Unexpected token/);
    await error.scrollIntoViewIfNeeded();
    await expect(error.getByRole("button",{name:"复制问题详情",exact:true})).toBeVisible();
    await error.screenshot({path:`work/video-followup-20261105/gateway-${status}-message.png`});
    await page.screenshot({path:`work/video-followup-20261105/gateway-${status}.png`,fullPage:true});
  });
}

test("a lost PUT response is recovered without uploading accepted bytes twice",async ({page}) => {
  let puts=0;
  await page.route("**/api/v1/admin/uploads/*/content",async route=>{
    if (route.request().method() !== "PUT") { await route.continue(); return; }
    // Supply the binary fixture explicitly so the automation transport does not
    // reinterpret native XHR bytes while simulating a lost server response.
    puts++; const response=await route.fetch({postData:await readFile(join(fixtures,"video-sample.mp4"))});
    expect(response.ok(),`${response.status()} ${await response.text()}`).toBeTruthy();
    await route.abort("failed");
  });
  const dialog=page.getByRole("dialog",{name:"上传视频",exact:true});
  await dialog.getByLabel("选择资料文件",{exact:true}).setInputFiles(join(fixtures,"video-sample.mp4"));
  await dialog.getByRole("button",{name:"上传",exact:true}).click();
  await expect(dialog.getByText("当前预览类型：视频")).toBeVisible();
  await expect(dialog.getByLabel("版本标签",{exact:true})).toHaveValue("V01.0");
  expect(puts).toBe(1);
});
