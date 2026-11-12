import { once } from "node:events";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { makeApiServer } from "../../services/domain/src/http";
import { TestStore } from "../support/store";
import { testBackend } from "../support/backend";
import { createVideoProbeRuntime, checkVideoRuntimeAtStartup } from "../../services/domain/src/video-probe.mjs";

if (process.env.TEST_VIDEO_RUNTIME_ISOLATED !== "true" || !process.send) throw new Error("Isolated test child only");
let selected: string | undefined = join(tmpdir(),"zj-missing-"+randomUUID());
const startup: unknown[] = [];
const runtime = createVideoProbeRuntime({env:()=>({...process.env,FFPROBE_PATH:selected})});
await checkVideoRuntimeAtStartup(runtime,line=>startup.push(JSON.parse(line)));
const store=new TestStore(undefined,true);
const server=makeApiServer(testBackend(store,{ENABLE_MOCK_ROLES:"true"}),{origins:["http://127.0.0.1:3431"],videoRuntime:runtime});
server.listen(0,"127.0.0.1"); await once(server,"listening");
const address=server.address(); if(!address || typeof address!=="object") throw new Error("Missing local address");
process.send({ready:true,base:"http://127.0.0.1:"+address.port});
process.on("message",async (message:{id:number;action:string})=>{
  if(message.action==="unavailable") selected=join(tmpdir(),"zj-missing-"+randomUUID());
  if(message.action==="restore") selected=process.env.FFPROBE_PATH;
  process.send?.({id:message.id,data:{sessionId:store.sessionId,startup,
    uploads:[...store.assets.uploads.values()].map(({productId,assetId,status})=>({productId,assetId,status}))}});
});
process.on("disconnect",()=>{
  server.closeAllConnections();
  server.close(()=>{void rm(store.assets.directory,{recursive:true,force:true}).finally(()=>process.exit(0));});
});
