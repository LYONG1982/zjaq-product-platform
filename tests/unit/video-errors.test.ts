import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { ApiError, createClient } from "../../packages/api-client/src/index";
import { uploadFailure } from "../../apps/admin/src/upload-errors";

test("non-JSON gateway failures preserve status, safe reason and request ID across upload stages", async () => {
  let status = 413;
  const server = createServer((_req, res) => { res.writeHead(status, { "Content-Type": "text/html", "X-Request-Id": "gateway-test-123" }); res.end("<html>PRIVATE_GATEWAY_PATH /srv/private/config</html>"); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const client = createClient(`http://127.0.0.1:${address.port}/api/v1`);
  try {
    for (const [http, code, text] of [[413,"FILE_TOO_LARGE","网关"],[415,"UNSUPPORTED_MEDIA_TYPE","格式"],[502,"SERVER_UNAVAILABLE","502"],[503,"SERVER_UNAVAILABLE","503"],[504,"REQUEST_TIMEOUT","超时"],[507,"STORAGE_FULL","存储"]] as const) {
      status = http;
      for (const run of [() => client.categories(), () => client.putBytes("test", new Blob(["bytes"])), () => client.completeUpload("test"), () => client.mediaAssetUrl("p", "a")]) {
        await assert.rejects(run, error => {
          assert.ok(error instanceof ApiError); assert.equal(error.status, http); assert.equal(error.code, code); assert.equal(error.requestId, "gateway-test-123"); assert.ok(error.message.includes(text)); assert.doesNotMatch(error.message, /PRIVATE|\/srv|Unexpected token|Cannot read/);
          return true;
        });
      }
    }
    status = 200;
    await assert.rejects(() => client.categories(), { code: "INVALID_RESPONSE" });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("standard API errors and field validation are preserved; UI gives next step without inventing request IDs", async () => {
  const client = createClient("http://127.0.0.1:1", async () => ({ status: 422, body: { requestId: "request-42", error: { code: "VALIDATION_FAILED", message: "现有业务校验", fieldErrors: [{ path: "name", message: "必填" }] } } }));
  await assert.rejects(() => client.categories(), error => { assert.ok(error instanceof ApiError); assert.equal(error.message,"现有业务校验"); assert.deepEqual(error.fields,[{path:"name",message:"必填"}]); return true; });
  const service = uploadFailure(new ApiError(503,"SERVER_UNAVAILABLE","服务端异常","request-42"),"checking");
  assert.match(service.message,/下一步：.*管理员/); assert.match(service.message,/检查文件.*request-42/);
  const codec = uploadFailure(new ApiError(422,"VIDEO_CODEC_UNSUPPORTED","检测到 HEVC"),"checking");
  assert.match(codec.message,/HEVC/); assert.match(codec.message,/H.264/); assert.doesNotMatch(codec.message,/请求编号/);
  const network = uploadFailure(new TypeError("Failed to fetch"),"uploading");
  assert.equal(network.code,"NETWORK_ERROR"); assert.match(network.message,/传输文件/);
});

test("video parser distinguishes codec/audio/container/configuration and sanitizes malformed tool results", async () => {
  const root = await mkdtemp(join(tmpdir(), "zj-video-error-matrix-"));
  const input = join(root, "test.mp4"); await writeFile(input, Buffer.from("0000ftypisom00000000000000000000"));
  const metadata = { format: { format_name: "mp4", duration: "1" }, streams: [{ codec_type: "video", codec_name: "h264", width: 32, height: 32, pix_fmt: "yuv420p" }] };
  const parse = (probe: string, file = input) => new Promise<{ok:boolean;error?:string}>(resolve => execFile(process.execPath, ["services/mock-api/src/parse-file.mjs",file,join(root,"output"),"mp4"], { env: {...process.env,FFPROBE_PATH:probe},timeout:10000 }, (_error, stdout) => resolve(JSON.parse(stdout))));
  async function fixture(name: string, source: string) { const path=join(root,name); await writeFile(path,"#!"+process.execPath+"\n"+source,{mode:0o700}); return path; }
  try {
    const cases: [string, unknown, string][] = [
      ["HEVC10bit", {...metadata,streams:[{...metadata.streams[0],codec_name:"hevc",pix_fmt:"yuv420p10le"}]}, "VIDEO_CODEC_UNSUPPORTED"],
      ["audio", {...metadata,streams:[...metadata.streams,{codec_type:"audio",codec_name:"flac"}]}, "VIDEO_AUDIO_CODEC_UNSUPPORTED"],
      ["container", {...metadata,format:{...metadata.format,format_name:"avi"}}, "VIDEO_CONTAINER_MISMATCH"],
      ["tracks", {...metadata,streams:[...metadata.streams,{codec_type:"subtitle",codec_name:"mov_text"}]}, "VIDEO_TRACKS_UNSUPPORTED"],
      ["pixels", {...metadata,streams:[{...metadata.streams[0],pix_fmt:"yuv444p"}]}, "VIDEO_LIMIT_UNSUPPORTED"],
      ["null", null, "VIDEO_PROBE_INVALID_RESULT"],
      ["nullstream", {...metadata,streams:[null]}, "VIDEO_PROBE_INVALID_RESULT"],
      ["missingformat", {...metadata,format:{}}, "VIDEO_PROBE_INVALID_RESULT"],
    ];
    for (const [name, value, code] of cases) {
      const path=await fixture(name,`process.stdout.write(${JSON.stringify(JSON.stringify(value))});`);
      const result=await parse(path); assert.equal(result.ok,false); assert.ok(result.error?.includes(code),JSON.stringify(result)); assert.ok(!result.error?.includes(root));
    }
    const config = await fixture("config",'process.stderr.write("Unrecognized option enable_drefs PRIVATE_SERVER_PATH");process.exit(1);');
    const bad=await parse(config); assert.match(bad.error!,/VIDEO_PROBE_CONFIGURATION/); assert.doesNotMatch(bad.error!,/PRIVATE|enable_drefs/);
    const missing=await parse(join(root,"missing")); assert.match(missing.error!,/VIDEO_PROBE_UNAVAILABLE/);
    const excessive=await fixture("excessive",'process.stdout.write("x".repeat(300000));');
    assert.match((await parse(excessive)).error!,/VIDEO_PROBE_INVALID_RESULT/);
    const inaccessible=await parse(config,join(root,"PRIVATE_MISSING_FILE")); assert.match(inaccessible.error!,/VIDEO_PROCESSING_FAILED/); assert.doesNotMatch(inaccessible.error!,/PRIVATE|zj-video-error/);
    const good=await fixture("good",`process.stdout.write(${JSON.stringify(JSON.stringify(metadata))});`); assert.equal((await parse(good)).ok,true);
  } finally { await rm(root,{recursive:true,force:true}); }
});
