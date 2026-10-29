import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { planProductIndexReconciliation, applyProductIndexReconciliation, loadProductIndexSnapshot, verifyProductIndexes, type ProductIndexSnapshot } from "../../services/api/src/product-index-reconciliation";
import type { Repository, Transaction } from "../../services/api/src/repository";
import { initialize } from "../../services/api/src/initialize";
import { normalizedModel } from "../../services/domain/src/product-code";
class Harness implements Repository {
  data=new Map<string,unknown>();
  async get<T>(c:string,id:string){return structuredClone(this.data.get(c+"/"+id)) as T|undefined;}
  async set(c:string,id:string,v:unknown){this.data.set(c+"/"+id,structuredClone(v));}
  async list<T>(c:string){return [...this.data].filter(([k])=>k.startsWith(c+"/")).map(([,v])=>structuredClone(v) as T);}
  async *entries<T>(c:string){for(const[k,v]of this.data)if(k.startsWith(c+"/"))yield{id:k.slice(c.length+1),value:structuredClone(v) as T};}
  async transaction<T>(fn:(tx:Transaction)=>Promise<T>){const before=new Map(structuredClone([...this.data]));try{return await fn(this);}catch(e){this.data=before;throw e;}}
}
const modelId=(name:string)=>"model-"+createHash("sha256").update(normalizedModel(name)).digest("hex");
const sample=():ProductIndexSnapshot=>({revision:7,products:[{id:"ZJ-D-S-A-005",value:{productId:"ZJ-D-S-A-005",publicId:"11111111-1111-4111-8111-111111111111",activeReleaseId:"release",lastReleaseId:"release"}},{id:"ZJ-001",value:{productId:"ZJ-001"}}],drafts:[{id:"ZJ-D-S-A-005",value:{content:{model:" New Model "}}},{id:"ZJ-001",value:{content:{}}}],releases:[{id:"release",value:{id:"release",productId:"ZJ-D-S-A-005",content:{model:"OLD-MODEL"}}}],indexes:[{id:modelId("retired-spelling"),value:{productId:"ZJ-D-S-A-005"}},{id:"code-ZJ-D-S-A",value:{next:3}}]});
const repoFor=async(s:ProductIndexSnapshot)=>{const r=new Harness();await r.set("control","state",{ready:true,maintenance:false,revision:s.revision});for(const[c,rows]of[["products",s.products],["drafts",s.drafts],["releases",s.releases],["control",s.indexes]]as const)for(const row of rows)await r.set(c,row.id,row.value);return r;};
test("reconcile derives counter high water and all draft/release/reserved models, preserving legacy attributes",()=>{
  const input=sample(),before=structuredClone(input),plan=planProductIndexReconciliation(input);
  assert.deepEqual(input,before);assert.equal(plan.products,2);assert.equal(plan.modelClaims,3);
  assert.deepEqual(plan.updates.find(u=>u.id==="code-ZJ-D-S-A")?.after,{next:6});
  assert.ok(plan.updates.some(u=>u.id===modelId("new model")));assert.ok(plan.updates.some(u=>u.id===modelId("old-model")));assert.ok(!plan.updates.some(u=>u.id===modelId("retired-spelling")));
  assert.ok(!plan.updates.some(u=>u.id.includes("ZJ-001")));assert.ok(plan.updates.some(u=>u.id.startsWith("public-")));
  const high=sample();high.indexes.find(r=>r.id.startsWith("code-"))!.value.next=99;assert.ok(!planProductIndexReconciliation(high).updates.some(u=>u.id.startsWith("code-")));
});
test("conflicting current, historical and reserved model claims plus corrupt/public indexes fail closed",()=>{
  const duplicate=sample();duplicate.drafts[1].value.content={model:"Ｎｅｗ　Ｍｏｄｅｌ"};assert.throws(()=>planProductIndexReconciliation(duplicate),/MODEL_OWNERSHIP_CONFLICT/);
  const historic=sample();historic.drafts[1].value.content={model:"old-model"};assert.throws(()=>planProductIndexReconciliation(historic),/MODEL_OWNERSHIP_CONFLICT/);
  const reserved=sample();reserved.indexes.push({id:modelId("New Model"),value:{productId:"ZJ-001"}});assert.throws(()=>planProductIndexReconciliation(reserved),/MODEL_INDEX_CONFLICT/);
  const invalid=sample();invalid.indexes.find(r=>r.id.startsWith("code-"))!.value.next=0;assert.throws(()=>planProductIndexReconciliation(invalid),/INVALID_CODE_COUNTER/);
  const publicBad=sample();publicBad.indexes.push({id:"public-11111111-1111-4111-8111-111111111111",value:{productId:"ZJ-001"}});assert.throws(()=>planProductIndexReconciliation(publicBad),/PUBLIC_INDEX/);
});
test("maintenance-only reconciliation is atomic, rejects stale/tampered plans and makes startup verification pass",async()=>{
  const repo=await repoFor(sample()),plan=planProductIndexReconciliation(await loadProductIndexSnapshot(repo));
  await assert.rejects(verifyProductIndexes(repo),/索引缺失/);await assert.rejects(applyProductIndexReconciliation(repo,plan),/MAINTENANCE/);
  await repo.set("control","state",{ready:true,maintenance:true,revision:7});
  const changed=structuredClone(plan);changed.updates[0].after={productId:"ZJ-001"};await assert.rejects(applyProductIndexReconciliation(repo,changed),/MODIFIED/);
  const beforeProducts=await repo.list("products"),beforeDrafts=await repo.list("drafts"),beforeReleases=await repo.list("releases");
  await applyProductIndexReconciliation(repo,plan);assert.deepEqual(await repo.list("products"),beforeProducts);assert.deepEqual(await repo.list("drafts"),beforeDrafts);assert.deepEqual(await repo.list("releases"),beforeReleases);
  await repo.set("control","state",{ready:true,maintenance:false,revision:8});const verified=await verifyProductIndexes(repo);assert.equal(verified.updates.length,0);assert.equal((await repo.list("audit")).length,1);
  await assert.rejects(applyProductIndexReconciliation(repo,plan),/STALE/);
});
test("fresh initialization with the original 27 blank models passes readonly gate without invented attributes",async()=>{
  const repo=new Harness();await initialize(repo,"test-admin");const before=structuredClone([...repo.data]);const plan=await verifyProductIndexes(repo);assert.equal(plan.products,27);assert.equal(plan.updates.length,0);assert.deepEqual([...repo.data],before);
});

test("index operator parser rejects ambiguous flags before any cloud client is created",async()=>{
  const {parseProductIndexArguments:parse}=await import("../../services/api/src/product-index-arguments");
  assert.equal(parse([]).help,true);assert.equal(parse(["--file","backup.json","--out","plan.json"]).apply,false);assert.equal(parse(["--apply","--environment","example","--plan","plan.json","--file","backup.json"]).apply,true);
  for(const args of [
    ["--apply"],["--apply","--file","b","--plan","p"],["--apply","--file","b","--plan","p","--environment"],
    ["--file","--out","--out","p"],["--file","b","--out","p","--file","c"],["--file","b","--out","p","--unknown"],
    ["--file","b","--out","p","--environment","example"],["--apply","--file","b","--plan","p","--environment","example","--out","x"],
  ])assert.throws(()=>parse(args));
});
