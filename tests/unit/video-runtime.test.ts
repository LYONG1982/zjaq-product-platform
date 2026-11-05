import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createVideoProbeRuntime, classifyVideoProbeFailure, videoProbeCommand, checkVideoRuntimeAtStartup } from "../../services/domain/src/video-probe.mjs";
import { makeApiServer } from "../../services/domain/src/http";
import { MockStore } from "../../services/mock-api/src/store";
import { mockBackend } from "../../services/mock-api/src/backend";

const good = { stdout: "ffprobe version 8.1.1 Copyright test\nprivate build details" };
test("probe path rules and failure classification never return diagnostic stderr", () => {
  assert.equal(videoProbeCommand({}).source, "PATH");
  assert.equal(videoProbeCommand({ FFPROBE_PATH: "ffprobe" }).source, "PATH");
  for (const value of ["./ffprobe", "ffprobe -version", '"/srv/ffprobe"', "/srv/ffprobe\n"]) {
    assert.equal(videoProbeCommand({ FFPROBE_PATH: value }).error?.reason, "INVALID_PATH");
  }
  assert.equal(videoProbeCommand({ FFPROBE_PATH: join(tmpdir(), "folder with space", "ffprobe") }).error, undefined);
  for (const [error, stderr, reason] of [
    [{code:"ENOENT"}, "", "NOT_FOUND"], [{code:"EACCES"}, "", "PERMISSION_DENIED"],
    [{code:"ENOEXEC"}, "", "EXEC_FORMAT"], [{code:1}, "Exec format error", "EXEC_FORMAT"],
    [{code:1}, "dyld: Library not loaded /private/lib", "RUNTIME_DEPENDENCY"],
    [{code:1}, "Unrecognized option enable_drefs", "UNSUPPORTED_OPTIONS"],
    [{killed:true}, "", "TIMEOUT"], [{code:"ERR_CHILD_PROCESS_STDIO_MAXBUFFER",killed:true}, "", "OUTPUT_LIMIT"],
  ] as const) {
    const result = classifyVideoProbeFailure(error, stderr + " SECRET /private/config");
    assert.equal(result?.reason, reason); assert.doesNotMatch(JSON.stringify(result), /SECRET|\/private/);
  }
  assert.equal(classifyVideoProbeFailure({code:1}, "moov atom not found"), null);
});

test("version checks coalesce, cache briefly, expire and recover without health spawning processes", async () => {
  let now = 0, calls = 0, ready = false;
  const runtime = createVideoProbeRuntime({ now: () => now, env: () => ({}), run: async () => {
    calls++; await new Promise(resolve => setImmediate(resolve));
    return ready ? good : { error: {code:"ENOENT"}, stdout:"", stderr:"SECRET" };
  }});
  assert.equal(runtime.status().status, "not_checked"); assert.equal(calls, 0);
  const checks = Array.from({length:20}, () => runtime.check());
  assert.equal(runtime.status().status, "checking");
  await Promise.all(checks); assert.equal(calls, 1); assert.equal(runtime.status().status, "unavailable");
  ready = true; now = 4999; assert.equal((await runtime.check()).ready, false); assert.equal(calls, 1);
  now = 5000; assert.equal(runtime.status().status, "stale"); assert.equal((await runtime.check()).ready, true); assert.equal(calls, 2);
  now = 34999; await runtime.check(); assert.equal(calls, 2);
  now = 35000; assert.equal(runtime.status().status, "stale"); await runtime.check(); assert.equal(calls, 3);
  const lines: string[] = []; await checkVideoRuntimeAtStartup(runtime, line => lines.push(line));
  assert.equal(calls, 3); assert.match(lines[0], /video_runtime_checked/); assert.doesNotMatch(lines[0], /SECRET|command|source|stderr|private build/);
});

test("configuration changes invalidate old checks, including racing in-flight results", async () => {
  let selected = join(tmpdir(), "probe-a"), release!: () => void;
  const runtime = createVideoProbeRuntime({ env: () => ({FFPROBE_PATH:selected}), run: async command => {
    if (command.endsWith("probe-a")) await new Promise<void>(resolve => { release = resolve; });
    return command.endsWith("probe-a") ? good : {error:{code:"EACCES"},stdout:""};
  }});
  const old = runtime.check(); selected = join(tmpdir(), "probe-b");
  assert.equal(runtime.status().status, "not_checked"); await runtime.check(); release(); await old;
  assert.equal(runtime.status().status, "unavailable"); assert.equal(runtime.status().reason, "PERMISSION_DENIED");
});

test("unexpected version output and runner exceptions produce safe diagnoses", async () => {
  for (const stdout of ["", "ffmpeg version 8", "ffprobe version /private/SECRET", "SECRET\nffprobe version 8"]) {
    const result = await createVideoProbeRuntime({run:async () => ({stdout})}).check();
    assert.equal(result.ready, false); if (!result.ready) assert.equal(result.reason, "INVALID_OUTPUT");
  }
  const result = await createVideoProbeRuntime({run:async () => {throw new Error("SECRET");}}).check();
  assert.equal(result.ready, false); assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test("real executable launch bounds timeout/output; CLI has useful exit codes without loading a database", {skip: process.platform === "win32"}, async () => {
  const root = await mkdtemp(join(tmpdir(), "zj-probe-runtime-"));
  async function executable(name: string, code: string, mode = 0o700) {
    const path = join(root,name); await writeFile(path,"#!"+process.execPath+"\n"+code,{mode}); return path;
  }
  const cli = (probe: string) => new Promise<{exit: number; report:any}>(resolve => execFile(process.execPath, ["scripts/check-video-runtime.mjs"],
    {env:{...process.env, FFPROBE_PATH:probe, DATABASE_URL:"SECRET_UNUSED", CLOUDBASE_ENV_ID:"SECRET_UNUSED"}, timeout:10000},
    (error, stdout) => resolve({exit:error ? Number(error.code) : 0, report:JSON.parse(stdout)})));
  try {
    const valid = await executable("probe with space", 'console.log("ffprobe version 8.1.1 test")');
    const noPermission = await executable("no-permission", "", 0o600);
    const endless = await executable("timeout", "setInterval(()=>{},1000)");
    const excessive = await executable("output", 'process.stdout.write("x".repeat(200000))');
    for (const [command, reason] of [[join(root,"missing"),"NOT_FOUND"],[noPermission,"PERMISSION_DENIED"],[endless,"TIMEOUT"],[excessive,"OUTPUT_LIMIT"]]) {
      const result = await createVideoProbeRuntime({env:()=>({...process.env,FFPROBE_PATH:command}),timeoutMs:reason === "TIMEOUT" ? 300 : 5000}).check();
      assert.equal(result.ready,false); if (!result.ready) assert.equal(result.reason,reason);
    }
    const success = await cli(valid); assert.equal(success.exit,0); assert.equal(success.report.ready,true);
    const failed = await cli(join(root,"missing")); assert.equal(failed.exit,1); assert.equal(failed.report.reason,"NOT_FOUND");
    const invalid = await cli("relative/path"); assert.equal(invalid.exit,1); assert.equal(invalid.report.reason,"INVALID_PATH");
    assert.doesNotMatch(JSON.stringify([success,failed,invalid]), /SECRET_UNUSED|DATABASE_URL|CLOUDBASE_ENV_ID/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("HTTP rejects videos before allocation, preserves authorization and nonvideo uploads, and recovers", async () => {
  let calls = 0, now = 0, available = false;
  const runtime = createVideoProbeRuntime({env:()=>({FFPROBE_PATH:join(tmpdir(),"PRIVATE_PROBE")}),now:()=>now,
    run:async () => { calls++; return available ? good : {error:{code:"ENOENT"},stdout:"",stderr:"SECRET"}; }});
  const store = new MockStore(undefined,true);
  const server = makeApiServer(mockBackend(store,{ENABLE_MOCK_ROLES:"true"}),{videoRuntime:runtime});
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  const address = server.address(); assert.ok(address && typeof address === "object"); const base = `http://127.0.0.1:${address.port}`;
  const body = {productId:"ZJ-001",fileName:"demo.mp4",contentType:"video/mp4",purpose:"preview",size:100};
  async function post(data: unknown, token = "local-admin", key: string | null = randomUUID()) {
    const response = await fetch(base+"/api/v1/admin/uploads",{method:"POST",headers:{"Content-Type":"application/json",
      ...(token ? {Authorization:"Bearer "+token} : {}),...(key ? {"Idempotency-Key":key} : {})},body:JSON.stringify(data)});
    return {response,body:await response.json()};
  }
  try {
    assert.equal((await (await fetch(base+"/health")).json()).capabilities.video.status,"not_checked");
    assert.equal((await post(body,"")).response.status,401);
    assert.equal((await post(body,"local-sales")).response.status,403);
    assert.equal((await post({...body,productId:"MISSING"})).response.status,404);
    assert.equal((await post({...body,size:501*1024*1024})).response.status,400);
    assert.equal((await post({...body,fileName:"path/demo.mp4"})).response.status,400);
    assert.equal((await post({...body,contentType:"application/pdf"})).response.status,422);
    assert.equal((await post(body,"local-admin",null)).response.status,400);
    assert.equal(calls,0);
    const key=randomUUID(); const blocked=await post(body,"local-admin",key);
    assert.equal(blocked.response.status,503); assert.equal(blocked.body.error.code,"VIDEO_PROBE_UNAVAILABLE");
    assert.equal(blocked.body.requestId,blocked.response.headers.get("X-Request-Id"));
    assert.equal(store.assets.uploads.size,0); assert.equal(store.idempotency.size,0); assert.deepEqual(await readdir(store.assets.directory),[]);
    for(let i=0;i<5;i++) {
      const health=await (await fetch(base+"/health")).json(); assert.equal(health.status,"ok"); assert.equal(health.capabilities.video.status,"unavailable");
      assert.doesNotMatch(JSON.stringify(health),/PRIVATE_PROBE|SECRET|command|stderr/);
    }
    assert.equal(calls,1);
    for(const [fileName,contentType,purpose] of [["sample-v1.pdf","application/pdf","preview"],["page-1.png","image/png","media"]]) {
      const bytes=await readFile(new URL("../fixtures/validation/"+fileName,import.meta.url));
      const intent=await post({...body,fileName,contentType,purpose,size:bytes.length}); assert.equal(intent.response.status,200);
      const put=await fetch(base+intent.body.data.uploadPath,{method:"PUT",headers:{Authorization:"Bearer local-admin","Content-Type":"application/octet-stream"},body:bytes}); assert.equal(put.status,200);
      const complete=await fetch(base+"/api/v1/admin/uploads/complete",{method:"POST",headers:{Authorization:"Bearer local-admin","Content-Type":"application/json"},body:JSON.stringify({uploadId:intent.body.data.uploadId})});
      assert.equal((await complete.json()).data.status,"READY");
    }
    assert.equal(calls,1); available=true; now=5000;
    assert.equal((await (await fetch(base+"/health")).json()).capabilities.video.status,"stale"); assert.equal(calls,1);
    const restored=await post(body,"local-admin",key); assert.equal(restored.response.status,200); assert.equal(calls,2);
    const retry=await post(body,"local-admin",key); assert.deepEqual(retry.body.data,restored.body.data);
    assert.equal((await post({...body,size:101},"local-admin",key)).response.status,409);
  } finally {server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); await rm(store.assets.directory,{recursive:true,force:true});}
});
