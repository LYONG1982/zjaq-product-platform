import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { verifyBackupObjects } from "../services/api/src/backup-objects";
import { parseProductIndexArguments } from "../services/api/src/product-index-arguments";
import { validateBackup } from "../services/api/src/backup-validation";
import { CloudBaseRepository } from "../services/api/src/repository";
import { applyProductIndexReconciliation, planProductIndexReconciliation, productIndexSnapshotFromBackup, type ProductIndexPlan } from "../services/api/src/product-index-reconciliation";
const options=parseProductIndexArguments(process.argv.slice(2));
if(options.help){
  console.log(JSON.stringify({dryRun:true,cloudConnected:false,command:"node --import tsx scripts/reconcile-product-indexes.ts --file PRIVATE_BACKUP.json --out PRIVATE_INDEX_PLAN.json",scope:"reserve all draft/release/historical model claims; advance five-part counters; verify public mappings; preserve old product identifiers"},null,2));
  process.exit(0);
}
const backup=validateBackup(JSON.parse(await readFile(options.file!,"utf8")));
const computed=planProductIndexReconciliation(productIndexSnapshotFromBackup(backup));
if(!options.apply){
  await writeFile(options.output!,JSON.stringify(computed,null,2)+"\n",{flag:"wx",mode:0o600});
  console.log(JSON.stringify({dryRun:true,cloudConnected:false,planWritten:true,products:computed.products,updates:computed.updates.length,modelClaims:computed.modelClaims,codePrefixes:computed.codePrefixes,publicIds:computed.publicIds},null,2));
}else{
  const target=options.environment;
  if(!target || target!==process.env.CLOUDBASE_ENV_ID || target!==backup.environment || !options.plan)throw new Error("Apply requires the exact backup environment, CLOUDBASE_ENV_ID and reviewed --plan");
  const plan=JSON.parse(await readFile(options.plan!,"utf8")) as ProductIndexPlan;
  if(JSON.stringify(plan)!==JSON.stringify(computed))throw new Error("Backup and reviewed index plan differ");
  await verifyBackupObjects(backup,options.file!);
  const repo=new CloudBaseRepository(target,process.env.CLOUDBASE_COLLECTION_PREFIX??"zj_"),lease=randomUUID();
  await repo.transaction(async tx=>{
    const state=await tx.get<{ready:boolean;maintenance?:boolean;revision:number}>("control","state");
    if(!state?.ready||state.maintenance||state.revision!==plan.revision)throw new Error("Target changed or is under maintenance");
    await tx.set("control","state",{...state,maintenance:true,maintenanceOwner:lease});
  });
  try{console.log(JSON.stringify(await applyProductIndexReconciliation(repo,plan)));}
  finally{
    await repo.transaction(async tx=>{
      const state=await tx.get<{maintenanceOwner?:string}>("control","state");if(state?.maintenanceOwner!==lease)throw new Error("Maintenance owner changed; manual inspection required");const {maintenanceOwner,...rest}=state;await tx.set("control","state",{...rest,maintenance:false});
    });
  }
}
