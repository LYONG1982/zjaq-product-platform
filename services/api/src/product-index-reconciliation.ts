import { createHash, randomUUID } from "node:crypto";
import type { Repository } from "./repository";
import { normalizedModel } from "../../domain/src/product-code";
import { isPublicProductId } from "../../domain/src/public-id";
type Row = { id: string; value: Record<string, unknown> };
export type ProductIndexSnapshot = { revision: number; products: Row[]; drafts: Row[]; releases: Row[]; indexes: Row[] };
export type ProductIndexPlan = { format: 1; revision: number; inventory: string; updates: { id: string; before: Record<string, unknown> | null; after: Record<string, unknown> }[]; products: number; modelClaims: number; codePrefixes: number; publicIds: number };
const digest = (value: unknown): string => {
  const canonical = (v: any): any => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value)) ?? "undefined").digest("hex");
};
const indexId = (id: string) => /^(?:code-|model-|public-)/.test(id);
const inventory = (s: ProductIndexSnapshot) => digest({ revision:s.revision, ...Object.fromEntries(["products","drafts","releases","indexes"].map(k=>[k,[...s[k as "products"]].sort((a,b)=>a.id.localeCompare(b.id))])) });
function rows(records: Row[], kind: string) {
  const result = new Map<string,Record<string,unknown>>();
  for(const row of records){if(!row.id || result.has(row.id))throw new Error("DUPLICATE_"+kind);result.set(row.id,row.value);}
  return result;
}
/** No assignment to unknown product attributes and no changes to product/release records. */
export function planProductIndexReconciliation(snapshot: ProductIndexSnapshot): ProductIndexPlan {
  if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1)throw new Error("INVALID_REVISION");
  const products=rows(snapshot.products,"PRODUCT"),drafts=rows(snapshot.drafts,"DRAFT"),releases=rows(snapshot.releases,"RELEASE"),existing=rows(snapshot.indexes,"INDEX");
  const models=new Map<string,string>(),publicIds=new Map<string,string>(),prefixes=new Map<string,number>();
  const claimModel=(productId:string,value:unknown)=>{
    if(value==null)return;if(typeof value!=="string")throw new Error("INVALID_STORED_MODEL");if(!value.trim())return;
    const id="model-"+createHash("sha256").update(normalizedModel(value)).digest("hex"),owner=models.get(id);
    if(owner&&owner!==productId)throw new Error("MODEL_OWNERSHIP_CONFLICT: "+id);
    models.set(id,productId);
  };
  for(const [id,product] of products){
    if(product.productId!==id)throw new Error("PRODUCT_DOCUMENT_ID_MISMATCH");
    const match=id.match(/^(ZJ-[DYSA]-[SH]-[AB])-(\d{3})$/);
    if(match){const sequence=Number(match[2]);if(sequence<1)throw new Error("INVALID_PRODUCT_CODE");prefixes.set(match[1],Math.max(prefixes.get(match[1])??1,sequence+1));}
    else if(!/^ZJ-[0-9]{3,}$/.test(id))throw new Error("INVALID_PRODUCT_CODE");
    const draft=drafts.get(id);if(!draft)throw new Error("MISSING_DRAFT");
    claimModel(id,(draft.content as Record<string,unknown>|undefined)?.model);
    if(product.publicId!=null){if(!isPublicProductId(product.publicId))throw new Error("INVALID_PUBLIC_ID");const key="public-"+product.publicId.toLowerCase();if(publicIds.has(key))throw new Error("DUPLICATE_PUBLIC_ID");publicIds.set(key,id);}
    for(const releaseId of [product.activeReleaseId,product.lastReleaseId])if(releaseId && (!releases.has(String(releaseId))||releases.get(String(releaseId))?.productId!==id))throw new Error("MISSING_OR_MISMATCHED_RELEASE");
  }
  for(const [id] of drafts)if(!products.has(id))throw new Error("ORPHAN_DRAFT");
  for(const [id,release] of releases){
    if(release.id!==id || typeof release.productId!=="string" || !products.has(release.productId))throw new Error("ORPHAN_OR_INVALID_RELEASE");
    claimModel(release.productId,(release.content as Record<string,unknown>|undefined)?.model);
  }
  // Preserve reserved historical model hashes even if their original spelling is
  // no longer present in the current draft or any retained release.
  for(const [id,value] of existing){
    if(id.startsWith("model-")){
      if(!/^model-[a-f0-9]{64}$/.test(id)||typeof value.productId!=="string"||!products.has(value.productId))throw new Error("ORPHAN_OR_INVALID_MODEL_INDEX");
      const owner=models.get(id);if(owner&&owner!==value.productId)throw new Error("MODEL_INDEX_CONFLICT: "+id);models.set(id,value.productId);
    }else if(id.startsWith("code-")){
      if(!/^code-ZJ-[DYSA]-[SH]-[AB]$/.test(id)||!Number.isSafeInteger(value.next)||Number(value.next)<1||Number(value.next)>1000)throw new Error("INVALID_CODE_COUNTER");
    }else if(id.startsWith("public-")){
      if(publicIds.get(id)!==value.productId)throw new Error("ORPHAN_OR_CONFLICTING_PUBLIC_INDEX");
    }else throw new Error("INVALID_INDEX_RECORD");
  }
  const updates:ProductIndexPlan["updates"]=[];
  const upsert=(id:string,after:Record<string,unknown>)=>{const before=existing.get(id)??null;if(digest(before)!==digest(after))updates.push({id,before,after});};
  for(const [id,productId] of models)if(!existing.has(id))upsert(id,{productId});
  for(const [prefix,minNext] of prefixes){const id="code-"+prefix,current=existing.get(id);if(!current||Number(current.next)<minNext)upsert(id,{next:Math.max(minNext,Number(current?.next??1))});}
  for(const [id,productId] of publicIds)if(!existing.has(id))upsert(id,{productId});
  return {format:1,revision:snapshot.revision,inventory:inventory(snapshot),updates:updates.sort((a,b)=>a.id.localeCompare(b.id)),products:products.size,modelClaims:models.size,codePrefixes:prefixes.size,publicIds:publicIds.size};
}
export async function loadProductIndexSnapshot(repo: Repository): Promise<ProductIndexSnapshot> {
  if(!repo.entries)throw new Error("INDEX_RECONCILIATION_REQUIRES_ENTRY_SCANNER");
  const state=await repo.get<{ready:boolean;revision:number}>("control","state");if(!state?.ready)throw new Error("NOT_INITIALIZED");
  const read=async(name:string,filter=(row:Row)=>true)=>{const out:Row[]=[];for await(const row of repo.entries!<Record<string,unknown>>(name))if(filter(row))out.push(row);return out;};
  const products=await read("products"),drafts=await read("drafts"),releases=await read("releases"),indexes=await read("control",row=>indexId(row.id));
  const end=await repo.get<{revision:number}>("control","state");if(state.revision!==end?.revision)throw new Error("CONCURRENT_INDEX_INVENTORY");
  return {revision:state.revision,products,drafts,releases,indexes};
}
export async function verifyProductIndexes(repo: Repository){
  const state=await repo.get<{maintenance?:boolean}>("control","state");if(state?.maintenance)throw new Error("环境正在维护，拒绝启动产品 API");
  const plan=planProductIndexReconciliation(await loadProductIndexSnapshot(repo));
  if(plan.updates.length)throw new Error("产品编码/型号/公开标识索引缺失或序号落后；先离线核对并使用 scripts/reconcile-product-indexes.ts 生成审阅计划，不自动修复（"+plan.updates.length+"项）");
  return plan;
}
/** Explicit maintenance-only operation; caller must hold the current revision. */
export async function applyProductIndexReconciliation(repo: Repository, plan: ProductIndexPlan){
  const snapshot=await loadProductIndexSnapshot(repo),expected=planProductIndexReconciliation(snapshot);
  if(digest(plan)!==digest(expected))throw new Error("STALE_OR_MODIFIED_INDEX_PLAN");
  return repo.transaction(async tx=>{
    const state=await tx.get<{ready:boolean;maintenance:boolean;revision:number}>("control","state");
    if(!state?.ready||!state.maintenance||state.revision!==plan.revision)throw new Error("MAINTENANCE_AND_REVISION_REQUIRED");
    for(const [collection,entries]of [["products",snapshot.products],["drafts",snapshot.drafts],["releases",snapshot.releases],["control",snapshot.indexes]] as const)
      for(const row of entries)if(digest(await tx.get(collection,row.id))!==digest(row.value))throw new Error("CONCURRENT_INDEX_SOURCE_CHANGE");
    for(const update of plan.updates){const prior=await tx.get("control",update.id);if(digest(prior??null)!==digest(update.before))throw new Error("CONCURRENT_INDEX_CHANGE");await tx.set("control",update.id,update.after);}
    await tx.set("control","state",{...state,revision:state.revision+1});
    const eventId=randomUUID();await tx.set("audit",eventId,{eventId,actorId:"maintenance-operator",actorName:"维护操作员",action:"RECONCILE_PRODUCT_INDEXES",targetId:"product-indexes",requestId:plan.inventory,createdAt:new Date().toISOString(),draftVersion:null,publicationVersion:null,releaseSequence:null});
    return {updated:plan.updates.length,revision:state.revision+1};
  });
}
export function productIndexSnapshotFromBackup(backup:{revision:number;records:Record<string,Record<string,unknown>[]>}):ProductIndexSnapshot {
  const records=(name:string)=>backup.records[name].map(row=>{const {_id,...value}=row;if(typeof _id!=="string")throw new Error("MISSING_DOCUMENT_ID");return {id:_id,value};});
  return {revision:backup.revision,products:records("products"),drafts:records("drafts"),releases:records("releases"),indexes:records("control").filter(row=>indexId(row.id))};
}
