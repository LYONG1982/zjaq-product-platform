import test from "node:test";
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { open, readFile, rm, stat, copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { request } from "node:http";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { prepareVideoFixtures, sparsePdf } from "../helpers/upload-fixtures";
import { after } from "node:test";
import { AssetStore } from "../../services/mock-api/src/assets";
import { CloudAssets, persisted } from "../../services/api/src/cloud-assets";
import { makeMockServer } from "../../services/mock-api/src/server";
import { MockStore } from "../../services/mock-api/src/store";
import type { Repository, Transaction } from "../../services/api/src/repository";
const fixtures = new URL("../fixtures/validation/", import.meta.url);
const videoFixtures = await prepareVideoFixtures();
after(() => rm(videoFixtures,{recursive:true,force:true}));
const hash = async (path: string) => { const h = createHash("sha256"); for await (const chunk of createReadStream(path)) h.update(chunk); return h.digest("hex"); };
class Repo implements Repository {
  data = new Map<string, unknown>();
  async get<T>(c:string,id:string){ return structuredClone(this.data.get(c+"/"+id)) as T | undefined; }
  async set(c:string,id:string,value:unknown){ this.data.set(c+"/"+id,structuredClone(value)); }
  async list<T>(c:string){return [...this.data].filter(([k])=>k.startsWith(c+"/")).map(([,v])=>structuredClone(v) as T);}
  async transaction<T>(fn:(tx:Transaction)=>Promise<T>){return fn(this);}
}
async function putFile(store: AssetStore, file: string, mime: string, path: string) {
  const intent = store.create({productId:"TEST",fileName:file,contentType:mime,size:(await stat(path)).size,purpose:"preview"});
  const req = createReadStream(path) as unknown as IncomingMessage;
  req.headers = {"content-type":"application/octet-stream", "content-length":String((await stat(path)).size)};
  await store.put(intent.uploadId, req);
  return store.complete(intent.uploadId);
}
test("video MP4/MOV/WebM are verified without transcoding; spoofing fails and originals remain byte exact", async () => {
  const store = new AssetStore();
  try {
    for(const [ext,mime] of [["mp4","video/mp4"],["mov","video/quicktime"],["webm","video/webm"]]) {
      const path = join(videoFixtures,"video-sample."+ext);
      const result = await putFile(store,"video."+ext,mime,path);
      assert.equal(result.status,"READY",JSON.stringify(result));
      assert.equal(result.mimeType,mime);
      assert.equal(result.checksum,await hash(path));
    }
    const fake = await putFile(store,"fake.mp4","video/mp4",fileURLToPath(new URL("sample-v1.pdf",fixtures)));
    assert.equal(fake.status,"REJECTED");
    assert.equal(await stat(store.get(fake.uploadId).path).catch(()=>null),null);
  } finally { await rm(store.directory,{recursive:true,force:true}); }
});
test("images retain original bytes separately from safe PNG derivative, in local and Cloud storage adapters", async () => {
  const store = new AssetStore(), repo = new Repo();
  const root = await mkdtemp(join(tmpdir(),"zj-cloud-assets-"));
  const objects = new Map<string,string>();
  const storage = {
    async upload(id:string,path:string){const dest=join(root,randomUUID());await copyFile(path,dest);objects.set(id,dest);return id;},
    async download(id:string,path:string){await copyFile(objects.get(id)!,path);},
    async remove(ids:string[]){for(const id of ids){await rm(objects.get(id)!,{force:true});objects.delete(id);}},
  };
  try {
    const original = fileURLToPath(new URL("page-1.png",fixtures));
    const result = await putFile(store,"page.png","image/png",original);
    assert.equal(result.status,"READY",JSON.stringify(result));
    const asset=store.get(result.uploadId); assert.ok(asset.preview?.path);
    assert.equal(await hash(asset.path),await hash(original));
    await repo.set("control","state",{ready:true,revision:1});
    const raw = await storage.upload("raw",asset.path), preview = await storage.upload("preview",asset.preview.path!);
    await repo.set("assets",asset.assetId,{...persisted(asset,raw),previewFileId:preview});
    const cloud=new CloudAssets(repo,storage);
    const safe=await cloud.bytes("TEST",asset.assetId); assert.equal(await hash(safe.path),asset.preview.checksum);await safe.cleanup();
    const source=await cloud.bytes("TEST",asset.assetId,true);assert.equal(await hash(source.path),await hash(original));await source.cleanup();
    assert.ok(!(await repo.get<any>("assets",asset.assetId)).preview.path);
  } finally {await rm(store.directory,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}
});
test("499/500 MiB real HTTP streams pass admission/check/Range; 501 MiB is refused before bytes, Cloud uses disk streams", {timeout:300000}, async () => {
  const store = new MockStore(); const server=makeMockServer({APP_ENV:"test",ENABLE_MOCK_ROLES:"true"},store);
  server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();assert.ok(address&&typeof address==="object");
  const base="http://127.0.0.1:"+address.port;const root=await mkdtemp(join(tmpdir(),"zj-500m-"));
  const json = async(path:string,body:unknown)=>{const r=await fetch(base+path,{method:"POST",headers:{Authorization:"Bearer local-admin","Content-Type":"application/json","Idempotency-Key":randomUUID()},body:JSON.stringify(body)});return {status:r.status,data:(await r.json()).data};};
  try {
    for(const mib of [499,500]){
      const path=join(root,"size.pdf");await sparsePdf(path,mib*1024*1024);
      const intent=await json("/api/v1/admin/uploads",{productId:"ZJ-001",purpose:"preview",fileName:"large.pdf",contentType:"application/pdf",size:mib*1024*1024});assert.equal(intent.status,200);
      const start=Date.now();
      const result=await new Promise<{status:number;body:any}>((resolve,reject)=>{
        const req=request(base+intent.data.uploadPath,{method:"PUT",headers:{Authorization:"Bearer local-admin","Content-Type":"application/octet-stream","Content-Length":String(mib*1024*1024)}},res=>{const chunks:Buffer[]=[];res.on("data",c=>chunks.push(c));res.on("end",()=>resolve({status:res.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString())}));});req.on("error",reject);createReadStream(path).on("error",reject).pipe(req);
      });assert.equal(result.status,200,JSON.stringify(result.body));
      const complete=await json("/api/v1/admin/uploads/complete",{uploadId:intent.data.uploadId});assert.equal(complete.data.status,"READY",JSON.stringify(complete));assert.equal(complete.data.size,mib*1024*1024);
      const range=await fetch(base+"/api/v1/admin/products/ZJ-001/assets/"+intent.data.assetId+"/content",{headers:{Authorization:"Bearer local-admin",Range:"bytes=-32"}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);
      // Model Cloud object service with copyFile, never a Buffer (real cloud not connected).
      const repo=new Repo();await repo.set("control","state",{ready:true,revision:1});const original=store.assets.get(intent.data.uploadId);const object=join(root,"cloud-object");await copyFile(original.path,object);await repo.set("assets",original.assetId,persisted(original,"cloud-test"));
      const cloud=new CloudAssets(repo,{async upload(){throw new Error("unused");},async download(_,dest){await copyFile(object,dest);}});
      const streamed=await cloud.bytes("ZJ-001",original.assetId,true);assert.equal(streamed.size,mib*1024*1024);assert.equal(await hash(streamed.path),complete.data.checksum);await streamed.cleanup();
      console.log(JSON.stringify({event:"large_upload_verified",mib,bytes:complete.data.size,durationMs:Date.now()-start,rssMiB:Math.round(process.memoryUsage().rss/1024/1024)}));
      await rm(path);await rm(object);await rm(original.path);
    }
    const refused=await json("/api/v1/admin/uploads",{productId:"ZJ-001",purpose:"preview",fileName:"too-large.mp4",contentType:"video/mp4",size:501*1024*1024});assert.equal(refused.status,400); // JSON schema rejects before disk reservation.
  } finally {server.close();await once(server,"close");await rm(root,{recursive:true,force:true});await rm(store.assets.directory,{recursive:true,force:true});}
});

test("authenticated media cookie stays read-only; video Range and images ZIP preserve current-release access", async () => {
  const store=new MockStore(undefined,true);const server=makeMockServer({APP_ENV:"test",ENABLE_MOCK_ROLES:"true"},store);server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr&&typeof addr==="object");const base="http://127.0.0.1:"+addr.port;
  const root=await mkdtemp(join(tmpdir(),"zj-zip-test-"));
  try {
    const a=await putFile(store.assets,"one.png","image/png",fileURLToPath(new URL("page-1.png",fixtures)));
    const b=await putFile(store.assets,"two.png","image/png",fileURLToPath(new URL("page-2.png",fixtures)));
    const v=await putFile(store.assets,"clip.mp4","video/mp4",join(videoFixtures,"video-sample.mp4"));
    for (const entry of [a,b,v]) store.assets.get(entry.uploadId).productId="ZJ-001";
    const p=store.products.get("ZJ-001")!;const publicId=randomUUID(),releaseId=randomUUID();
    p.publicId=publicId;p.publicationState="PUBLISHED";p.activeReleaseId=p.lastReleaseId=releaseId;
    p.draft.materials=[{materialId:"images",versionId:"v1",name:"图片资料",kind:"brochure",category:"promotional",subCategory:"onepager",versionLabel:"V1.0",preview:{kind:"images",pages:[{assetId:a.assetId,pageIndex:1,alt:"一"},{assetId:b.assetId,pageIndex:2,alt:"二"}]}},{materialId:"video",versionId:"v2",name:"视频资料",kind:"brochure",category:"promotional",subCategory:"video",versionLabel:"V1.0",preview:{kind:"video",assetId:v.assetId,mimeType:"video/mp4"}}];
    store.releases.set(releaseId,{id:releaseId,productId:p.productId,sequence:1,content:structuredClone(p.draft),publishedAt:new Date().toISOString(),publishedBy:"test"});
    const session=await fetch(base+"/api/v1/admin/media-session",{method:"POST",headers:{Authorization:"Bearer local-admin"}});assert.equal(session.status,204);
    const cookie=session.headers.get("set-cookie")!;assert.match(cookie,/HttpOnly; SameSite=Strict; Max-Age=300; Path=\/api\/v1\/admin\/products\//);assert.ok(!cookie.includes("Secure"));assert.ok(!cookie.includes("local-admin"));
    const privateUrl=base+"/api/v1/admin/products/ZJ-001/assets/"+v.assetId+"/content";
    const privateRange=await fetch(privateUrl,{headers:{Cookie:cookie.split(";")[0],Range:"bytes=0-15"}});assert.equal(privateRange.status,206);assert.equal((await privateRange.arrayBuffer()).byteLength,16);
    assert.equal((await fetch(base+"/api/v1/admin/me",{headers:{Cookie:cookie.split(";")[0]}})).status,401);
    assert.equal((await fetch(base+"/api/v1/admin/media-session",{method:"POST",headers:{Cookie:cookie.split(";")[0]}})).status,401);
    const manifest=await (await fetch(base+"/api/v1/catalog/products/"+publicId+"/materials/video/preview")).json();assert.equal(manifest.data.previewKind,"video");assert.equal(manifest.data.parts[0].mimeType,"video/mp4");
    const videoRange=await fetch(base+manifest.data.parts[0].path,{headers:{Range:"bytes=0-31"}});assert.equal(videoRange.status,206);assert.equal((await videoRange.arrayBuffer()).byteLength,32);
    const zipUrl=base+"/api/v1/sales/catalog/products/"+publicId+"/materials/images/source?releaseId="+releaseId+"&versionId=v1";
    assert.equal((await fetch(zipUrl)).status,401);
    const zip=await fetch(zipUrl,{headers:{Authorization:"Bearer local-sales"}});assert.equal(zip.status,200);assert.equal(zip.headers.get("content-type"),"application/zip");
    const zipPath=join(root,"images.zip");const f=await open(zipPath,"wx");await f.write(Buffer.from(await zip.arrayBuffer()));await f.close();
    const listed=execFileSync("unzip",["-Z1",zipPath],{encoding:"utf8"});assert.equal(listed,"001.png\n002.png\n");
    for(const [i,asset] of [a,b].entries()){const extracted=execFileSync("unzip",["-p",zipPath,String(i+1).padStart(3,"0")+".png"]);assert.equal(createHash("sha256").update(extracted).digest("hex"),asset.checksum);}
    store.users.set("mock-admin",{...store.users.get("mock-admin")!,enabled:false});assert.equal((await fetch(privateUrl,{headers:{Cookie:cookie.split(";")[0]}})).status,401);
    p.publicationState="OFFLINE";assert.equal((await fetch(base+manifest.data.parts[0].path,{headers:{Range:"bytes=0-3"}})).status,404);
  } finally {server.close();await once(server,"close");await rm(store.assets.directory,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}
});

test("media cookie encryption rejects tampering, enforces server expiry and fails closed without production key", async () => {
  const { mediaSessions }=await import("../../services/domain/src/media-session");
  const { CloudBasePrivateStorage }=await import("../../services/api/src/private-storage");
  const sessions=mediaSessions(false);const value=sessions.issue("test-only-bearer");assert.ok(!value.includes("test-only-bearer"));assert.equal(sessions.read(value),"test-only-bearer");assert.equal(sessions.read("AA"+value.slice(2)),undefined);
  const previous=Date.now;const start=Date.now();Date.now=()=>start+300001;try {assert.equal(sessions.read(value),undefined);} finally {Date.now=previous;}
  assert.throws(()=>mediaSessions(true).issue("unused"));
  let removed=false;const untrusted=new CloudBasePrivateStorage({getUploadMetadata:async()=>({data:{url:"http://127.0.0.1/never-connect",fileId:"cloud-test",token:"secret-never-printed",authorization:"secret-never-printed"}}),deleteFile:async()=>{removed=true;return {fileList:[{code:"SUCCESS"}]};}} as never);
  await assert.rejects(untrusted.upload("test",fileURLToPath(new URL("sample-v1.pdf",fixtures))),/受信任/);assert.equal(removed,true);
});

test("private Range cache deduplicates concurrent objects, rechecks ownership and evicts within bounded TTL",async()=>{
  const {AssetCache}=await import("../../services/api/src/asset-cache");
  const cache=new AssetCache(1024*1024,15);let downloads=0;
  const file=fileURLToPath(new URL("sample-v1.pdf",fixtures)),size=(await stat(file)).size,checksum=await hash(file);
  const load=async(dest:string)=>{downloads++;await new Promise(r=>setTimeout(r,20));await copyFile(file,dest);};
  try{
    const [a,b]=await Promise.all([cache.acquire("immutable",size,checksum,load),cache.acquire("immutable",size,checksum,load)]);assert.equal(downloads,1);assert.equal(a.path,b.path);
    await a.cleanup();await new Promise(r=>setTimeout(r,25));await cache.sweep();assert.ok(await stat(b.path));await b.cleanup();await new Promise(r=>setTimeout(r,25));await cache.sweep();assert.equal(await stat(b.path).catch(()=>null),null);
    const c=await cache.acquire("immutable",size,checksum,load);assert.equal(downloads,2);await c.cleanup();
  }finally{await cache.close();}
  const repo=new Repo(),store=new AssetStore(),root=await mkdtemp(join(tmpdir(),"zj-rejected-cloud-"));
  try{
    await repo.set("control","state",{ready:true,revision:1});
    const intent=store.create({productId:"TEST",purpose:"preview",fileName:"bad.pdf",contentType:"application/pdf",size:10});let removed=false;
    await repo.set("assets",intent.assetId,{...persisted(store.get(intent.uploadId),"private-invalid"),status:"CHECKING",size:10});await repo.set("uploads",intent.uploadId,{assetId:intent.assetId});
    const cloud=new CloudAssets(repo,{async upload(){throw new Error("unused");},async download(_id,dest){const f=await open(dest,"wx");await f.write(Buffer.from("not-a-pdf!"));await f.close();},async remove(){removed=true;}});
    const result=await cloud.complete(intent.uploadId);assert.equal(result.status,"REJECTED");const rejected=await cloud.get(intent.uploadId);assert.ok(!rejected.fileId);assert.ok(!rejected.lease);assert.equal(removed,true);await cloud.close();
  }finally{await rm(store.directory,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}
});

test("500 MiB MP4 metadata inspection and checksum stream avoid a full-memory video buffer",{timeout:180000},async()=>{
  const store=new AssetStore(),root=await mkdtemp(join(tmpdir(),"zj-video-500m-"));
  try{
    const path=join(root,"large.mp4"),small=await readFile(join(videoFixtures,"video-sample.mp4"));
    const f=await open(path,"wx",0o600);await f.write(small);const free=Buffer.alloc(8);free.writeUInt32BE(500*1024*1024-small.length);free.write("free",4,"ascii");await f.write(free);await f.truncate(500*1024*1024);await f.close();
    const result=await putFile(store,"large.mp4","video/mp4",path);assert.equal(result.status,"READY",JSON.stringify(result));assert.equal(result.size,524288000);assert.equal(result.checksum,await hash(path));
  }finally{await rm(store.directory,{recursive:true,force:true});await rm(root,{recursive:true,force:true});}
});
