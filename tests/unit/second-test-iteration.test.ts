import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { rm, mkdir, writeFile, readFile } from "node:fs/promises";
import sharp from "sharp";
import { normalizeProductName, productNameUnits, productNameError } from "@zj/contracts";
import { shareLink, shareQr } from "../../packages/api-client/src/sharing";
import { validateShareSettings } from "../../services/domain/src/share-settings";
import { TestStore } from "../support/store";
import { makeTestServer } from "../support/server";
import { DomainBackend } from "../../services/api/src/domain-backend";
import { bootstrapTestRepo } from "../support/bootstrap";
import { actorContext } from "../../services/domain/src/identity";
import type { Repository, Transaction } from "../../services/api/src/repository";
const create = { name:"新测试（名称）",owner:"虚构负责人",model:"SECOND-TEST",productType:"SOFTWARE",ownership:"SELF_DEVELOPED",categoryId:"miding",templateId:"software",templateVersion:1 };
test("name normalization and grapheme width preserve old long names and hidden content", async () => {
  assert.equal(normalizeProductName("版本（A1）"),"版本(A1)");
  assert.equal(productNameUnits("中A1()👩‍💻e\u0301"),5);assert.equal(productNameError("中".repeat(15)),"");assert.ok(productNameError("中".repeat(16)));assert.equal(productNameError("A".repeat(30)),"");
  const store=new TestStore();
  try {
    const d=store.create(create,randomUUID(),"new");assert.equal(d.content.name,"新测试(名称)");
    assert.throws(()=>store.create({...create,model:"LONG",name:"长".repeat(16)},randomUUID(),"long"),{status:422});
    const stored=store.product(d.productId);stored.draft.name="历史名称".repeat(8);stored.draft.technical={deployment:"历史参数"};stored.draft.boundaries="历史边界";
    const old=structuredClone(stored.draft);const saved=store.save(d.productId,{expectedDraftVersion:1,content:{...old,summary:"更新简介"}},"save");
    assert.equal(saved.content.name,old.name);assert.deepEqual(saved.content.technical,old.technical);assert.equal(saved.content.boundaries,old.boundaries);
    assert.throws(()=>store.save(d.productId,{expectedDraftVersion:2,content:{...saved.content,name:"新".repeat(16)}},"rename"),{status:422});
  } finally {await rm(store.assets.directory,{recursive:true,force:true});}
});
test("new PDF originals remain optional; image bounds and document admission are enforced server side",async()=>{
  const store=new TestStore();
  try {
    const d=store.create(create,randomUUID(),"new");
    const intent={productId:d.productId,fileName:"image.png",contentType:"image/png",purpose:"media" as const,size:2_000_000};
    const a=store.createUpload(intent,randomUUID());assert.ok(a.assetId);
    assert.throws(()=>store.createUpload({...intent,size:2_000_001},randomUUID()),{code:"FILE_TOO_LARGE"});
    for(const [fileName,contentType,purpose] of [["page.png","image/png","preview"],["source.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document","source"]]) assert.throws(()=>store.createUpload({...intent,fileName,contentType,purpose,size:10},randomUUID()),{code:"VALIDATION_FAILED"});
    assert.ok(store.createUpload({...intent,fileName:"original.pdf",contentType:"application/pdf",purpose:"source",size:10},randomUUID()));
    const image=store.assets.get(a.uploadId);image.status="READY";image.mimeType="image/png";image.size=100;image.checksum="a".repeat(64);
    const media=Array.from({length:6},(_,i)=>({mediaId:String(i),assetId:a.assetId,role:"screenshot" as const,alt:"测试图片"}));
    const six=store.save(d.productId,{expectedDraftVersion:1,content:{...d.content,media}},"six");
    assert.equal(six.content.media.length,6);
    assert.throws(()=>store.save(d.productId,{expectedDraftVersion:2,content:{...six.content,media:[...media,{...media[0],mediaId:"seven"}]}},"seven"),{status:422});
    store.product(d.productId).draft.media.push({...media[0],mediaId:"historical-seven"});
    assert.equal(store.save(d.productId,{expectedDraftVersion:2,content:{...store.draft(d.productId).content,summary:"只修改简介"}},"legacy").content.media.length,7);
  } finally {await rm(store.assets.directory,{recursive:true,force:true});}
});
test("sharing only accepts project HTTPS origins and UUID targets; QR is opaque black and white",async()=>{
  const env={SHARE_ALLOWED_ORIGINS:"https://uat.example.invalid"};const value={expectedVersion:0,baseUrl:"https://uat.example.invalid",target:"portal" as const,size:512 as const};
  assert.equal(validateShareSettings(value,env).baseUrl,value.baseUrl);
  for(const baseUrl of ["http://uat.example.invalid","https://other.invalid","https://uat.example.invalid.evil.test","https://user@uat.example.invalid","https://uat.example.invalid/?token=private","https://uat.example.invalid/path","bad"]) assert.throws(()=>validateShareSettings({...value,baseUrl},env),{status:422});
  const settings={version:0,baseUrl:value.baseUrl,target:"portal" as const,size:512 as const}, id=randomUUID();
  const link=shareLink(settings,id,"material-one",true);assert.equal(link,`https://uat.example.invalid/viewer?productId=${id}&materialId=material-one`);assert.doesNotMatch(link,/token|Bearer|ZJ-/);
  assert.throws(()=>shareLink(settings,"ZJ-001"));assert.throws(()=>shareLink({...settings,target:"h5"},id,"technical",true));assert.throws(()=>shareLink({...settings,baseUrl:null},id));
  const data=await shareQr(link,512), png=Buffer.from(data.split(",")[1],"base64");
  const {data:pixels,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,512);assert.equal(info.height,512);
  for(let i=0;i<pixels.length;i+=4) {assert.ok(pixels[i]===0||pixels[i]===255);assert.equal(pixels[i],pixels[i+1]);assert.equal(pixels[i+1],pixels[i+2]);assert.equal(pixels[i+3],255);}
  await mkdir("work/second-test-20261105",{recursive:true});await writeFile("work/second-test-20261105/qr-fixture.png",png);await writeFile("work/second-test-20261105/qr-target.txt",link);
});
test("share targets follow the current publication and enforce public-versus-sales material access",async()=>{
  const store=new TestStore();
  try {
    const d=store.create(create,randomUUID(),"create");
    assert.throws(()=>store.shareTarget(d.productId),{status:404});
    const upload=store.createUpload({productId:d.productId,purpose:"preview",fileName:"public.pdf",contentType:"application/pdf",size:100},randomUUID());
    Object.assign(store.assets.get(upload.uploadId),{status:"READY",mimeType:"application/pdf",pageCount:1,size:100,checksum:"b".repeat(64)});
    const material={materialId:"public",versionId:randomUUID(),name:"虚构 PDF",kind:"brochure",category:"promotional",subCategory:"onepager",versionLabel:"V01.0",preview:{kind:"pdf",assetId:upload.assetId,pageCount:1}};
    const content={...d.content,tagline:"虚构简介",summary:"本地验证",problemValues:[{id:"p",title:"问题",text:"验证"}],features:[{id:"f",title:"功能",text:"验证"}],scenarios:[{id:"s",title:"场景",text:"验证"}],materials:[material]};
    const saved=store.save(d.productId,{expectedDraftVersion:1,content},"save");
    const publication=store.publish(d.productId,{expectedDraftVersion:saved.draftVersion,expectedPublicationVersion:0,publicContentConfirmed:true},randomUUID(),"publish");
    const target=store.shareTarget(d.productId,"public");assert.equal(target.requiresSales,false);assert.doesNotMatch(target.publicId,/ZJ-/);
    assert.throws(()=>store.shareTarget(d.productId,"unpublished-new"),{status:404});
    const draft=store.draft(d.productId);
    store.save(d.productId,{expectedDraftVersion:draft.draftVersion,content:{...draft.content,materials:[{...draft.content.materials[0],versionId:randomUUID(),versionLabel:"V01.1",category:"technical",subCategory:"manual"}]}},"reclassify");
    assert.equal(store.shareTarget(d.productId,"public").requiresSales,true);
    assert.throws(()=>store.manifest(target.publicId,"public"),{status:404});
    store.unpublish(d.productId,{expectedPublicationVersion:publication.publicationVersion,reason:"测试下架"},randomUUID(),"unpublish");
    assert.throws(()=>store.shareTarget(d.productId,"public"),{status:404});
  } finally {await rm(store.assets.directory,{recursive:true,force:true});}
});
class Repo implements Repository {
  data=new Map<string,unknown>();
  async get<T>(c:string,id:string){return structuredClone(this.data.get(c+"/"+id)) as T|undefined;}
  async set(c:string,id:string,v:unknown){this.data.set(c+"/"+id,structuredClone(v));}
  async delete(c:string,id:string){this.data.delete(c+"/"+id);}
  async list<T>(c:string){return [...this.data].filter(([k])=>k.startsWith(c+"/")).map(([,v])=>structuredClone(v) as T);}
  async transaction<T>(fn:(t:Transaction)=>Promise<T>){const before=structuredClone(this.data);try{return await fn(this);}catch(e){this.data=before;throw e;}}
}
test("sharing settings enforce admin/version checks and persist across service reconstruction without touching products",async()=>{
  const old=process.env.SHARE_ALLOWED_ORIGINS;process.env.SHARE_ALLOWED_ORIGINS="https://uat.example.invalid";
  const repo=new Repo();await bootstrapTestRepo(repo,"share-admin");const make=()=>new DomainBackend(repo,{async subject(){return "share-admin";}},{async upload(){throw new Error("unused");},async download(){throw new Error("unused");}});
  try {const backend=make(), actor=await backend.authenticate("test");const products=await repo.list("products");
    await actorContext.run(actor,async()=>{
      const value={expectedVersion:0,baseUrl:"https://uat.example.invalid",target:"portal",size:512};
      const saved=await backend.writeShareSettings(value,"share-write");assert.equal(saved.version,1);
      await assert.rejects(backend.writeShareSettings(value,"stale"),{status:409});assert.deepEqual(await make().shareSettings(),saved);assert.deepEqual(await repo.list("products"),products);
    });
    await assert.rejects(actorContext.run({...actor,role:"CONTENT_MANAGER"},()=>backend.writeShareSettings({expectedVersion:1,baseUrl:null,target:"h5",size:512},"forbidden")),{status:403});
  } finally {if(old===undefined)delete process.env.SHARE_ALLOWED_ORIGINS;else process.env.SHARE_ALLOWED_ORIGINS=old;}
});
test("HTTP share settings stay admin-only and logout clears only the browser media cookie",async()=>{
  const store=new TestStore(undefined,true), server=makeTestServer({APP_ENV:"test",ENABLE_MOCK_ROLES:"true",SHARE_ALLOWED_ORIGINS:"https://uat.example.invalid"},store);
  server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr&&typeof addr==="object");const base=`http://127.0.0.1:${addr.port}/api/v1`;
  try {
    for(const [role,status] of [["",401],["local-mock",403],["local-sales",403],["local-admin",200]] as const) assert.equal((await fetch(base+"/admin/share-settings",{headers:role?{Authorization:"Bearer "+role}:{}})).status,status);
    const saved=await fetch(base+"/admin/share-settings",{method:"PUT",headers:{Authorization:"Bearer local-admin","Content-Type":"application/json"},body:JSON.stringify({expectedVersion:0,baseUrl:"https://uat.example.invalid",target:"h5",size:512})});assert.equal(saved.status,200);
    assert.equal((await (await fetch(base+"/catalog/share-settings")).json()).data.version,1);
    const out=await fetch(base+"/admin/logout",{method:"POST"});assert.equal(out.status,204);assert.match(out.headers.get("set-cookie")??"",/zj_admin_media=;.*Max-Age=0/);
    assert.equal((await fetch(base+"/admin/logout",{method:"POST",headers:{Origin:"https://hostile.invalid"}})).status,403);
    assert.equal((await fetch(base+"/admin/me",{headers:{Authorization:"Bearer local-admin"}})).status,200);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(store.assets.directory,{recursive:true,force:true});}
});
test("video failures distinguish unavailable probe, timeout, corruption and unsupported codec without leaking paths",{timeout:75000},async()=>{
 const {mkdtemp}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{execFile}=await import("node:child_process");
 const dir=await mkdtemp(join(tmpdir(),"zj-video-errors-")), input=join(dir,"container.mp4");await writeFile(input,Buffer.from("0000ftypisom00000000000000000000"));
 async function probe(name:string,source:string){const file=join(dir,name);await writeFile(file,"#!"+process.execPath+"\n"+source,{mode:0o700});return file;}
 const badCodec=await probe("codec",`process.stdout.write(JSON.stringify({format:{format_name:"mp4",duration:"1"},streams:[{codec_type:"video",codec_name:"hevc",width:32,height:32,pix_fmt:"yuv420p"}]}));`);
 const corrupt=await probe("corrupt",`process.stderr.write("PRIVATE_PATH_SECRET");process.exit(1);`);
 const timeout=await probe("timeout",`setTimeout(()=>{},70000);`);
 const parse=(path:string)=>new Promise<string>((resolve,reject)=>execFile(process.execPath,["services/domain/src/media/parse-file.mjs",input,join(dir,"out"),"mp4"],{env:{...process.env,FFPROBE_PATH:path},timeout:70000},(_error,stdout)=>{try{resolve(JSON.parse(stdout).error);}catch(e){reject(e);}}));
 try {
  const [unavailable,unsupported,broken,timedout]=await Promise.all([parse(join(dir,"missing")),parse(badCodec),parse(corrupt),parse(timeout)]);
  assert.match(unavailable,/VIDEO_PROBE_UNAVAILABLE/);assert.match(unsupported,/VIDEO_CODEC_UNSUPPORTED/);assert.match(broken,/VIDEO_CORRUPT/);assert.match(timedout,/VIDEO_PROBE_TIMEOUT/);
  for(const message of [unavailable,unsupported,broken,timedout]) {assert.ok(!message.includes(dir));assert.ok(!message.includes("PRIVATE_PATH_SECRET"));}
 } finally {await rm(dir,{recursive:true,force:true});}
});
