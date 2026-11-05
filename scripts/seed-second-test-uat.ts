/** Explicit, append-only fictional fixtures for the isolated second-test UAT. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "../packages/api-client/src/index";
import type { Domain } from "@zj/contracts";
const origin=process.env.SECOND_TEST_API_ORIGIN;
if(origin!=="http://127.0.0.1:3403")throw new Error("Explicit isolated API origin :3403 required; original UAT is not a target");
const health=await (await fetch(origin+"/health")).json();
if(health.provider!=="mock"||!health.sessionId)throw new Error("Only a session-memory Mock is allowed");
const api=createClient(origin+"/api/v1",undefined,"local-admin");
const key=(value:string)=>createHash("sha256").update(health.sessionId+" second-test "+value).digest("hex");
const existing=(await api.products({q:"(演示)二测",limit:100})).data;
if(existing.length)throw new Error("Second-test fixtures already exist; refusing to overwrite or reset them");
const categories=(await api.categories()).data;
const results=[];
for(const [index,categoryId] of ["miding","miyi","mishu","ai"].entries()) {
 const category=categories.find(c=>c.id===categoryId)!;
 let draft=(await api.create({name:"(演示)二测"+category.shortName,owner:"虚构验证人员",model:"SECOND-TEST-"+categoryId,productType:"SOFTWARE",ownership:"SELF_DEVELOPED",categoryId,templateId:category.defaultTemplateId as Domain["CreateProduct"]["templateId"],templateVersion:1,aliases:["二测演示", "隔离验证"]},key(categoryId))).data;
 async function upload(file:string,purpose:"preview"|"media") {
  const data=await readFile(new URL("../tests/fixtures/validation/"+file,import.meta.url));
  const intent=(await api.createUpload({productId:draft.productId,purpose,fileName:file,contentType:file.endsWith("pdf")?"application/pdf":"image/png",size:data.length},key(categoryId+file))).data;
  await api.putBytes(intent.uploadId,new Blob([data]));const checked=(await api.completeUpload(intent.uploadId)).data;if(checked.status!=="READY")throw new Error(checked.error??"fixture rejected");return checked;
 }
 const pdf=await upload("sample-v1.pdf","preview");
 draft.content.materials=[{materialId:"second-test-pdf",versionId:key(categoryId+"version"),name:"虚构产品介绍 PDF",kind:"brochure",category:"promotional",subCategory:"onepager",versionLabel:"V01.0",preview:{kind:"pdf",assetId:pdf.assetId,pageCount:pdf.pageCount!}}];
 for(const n of [1,2]) {const image=await upload(`page-${n}.png`,"media");draft.content.media.push({mediaId:"second-test-image-"+n,assetId:image.assetId,alt:"虚构验证图片 "+n,role:"screenshot"});}
 draft.content.tagline="仅供隔离验证，不代表真实产品能力";draft.content.summary="这是二次反馈迭代的虚构验证产品。所有文件仅供本地测试。\n第二段用于核验首行缩进、段落间距和图片阅读。";draft.content.audiences="本地验收人员";
 for(const field of ["problemValues","features","scenarios"] as const)draft.content[field]=[{id:field,title:"虚构"+field,text:"验证既有内容与字段保留，不代表真实业务描述。"}];
 draft=(await api.save(draft.productId,{expectedDraftVersion:draft.draftVersion,content:draft.content})).data;
 let publicId: string | null = null;
 if(index!==2) {const published=(await api.publish(draft.productId,{expectedDraftVersion:draft.draftVersion,expectedPublicationVersion:draft.publicationVersion,publicContentConfirmed:true},key(categoryId+"publish"))).data;publicId = (await api.shareTarget(draft.productId)).data.publicId; if(index===1)await api.unpublish(draft.productId,{expectedPublicationVersion:published.publicationVersion,reason:"演示下架状态"},key(categoryId+"offline"));}
 results.push({... (await api.draft(draft.productId)).data, publicId});
}
await mkdir("work/second-test-20261105",{recursive:true});await writeFile("work/second-test-20261105/uat-fixtures.json",JSON.stringify({sessionId:health.sessionId,origin,fictional:true,products:results},null,2)+"\n");console.log(JSON.stringify({sessionId:health.sessionId,created:results.map(d=>({id:d.productId,publicId:d.publicId,name:d.content.name,state:d.publicationState}))}));
