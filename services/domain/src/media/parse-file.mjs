// Runs in a bounded subprocess. No network URLs or executable document actions are accepted.
import { open, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { videoProbeCommand, classifyVideoProbeFailure } from "../video-probe.mjs";
import sharp from "sharp";
import yauzl from "yauzl";
import { SaxesParser } from "saxes";
import { crc32 } from "node:zlib";
const [input, output, type] = process.argv.slice(2);
const failure = (code, message) => new Error(`[${code}] ${message}`);
async function office(path, kind) {
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => {
        if (err) return reject(new Error("Office 文件容器损坏"));
        let total = 0,
          count = 0, xmlBytes = 0;
        const names = new Set();
        const xmls = new Map();
        const fail = (e) => {
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("entry", (entry) => {
          const name = entry.fileName;
          if (
            ++count > 2000 ||
            names.has(name) ||
            name.split("/").includes("..") ||
            name.startsWith("/") ||
            /vbaProject|ActiveX|embeddings\//i.test(name) ||
            entry.isEncrypted() ||
            (total += entry.uncompressedSize) > 600 * 1024 * 1024 ||
            ((name.endsWith(".xml") || name.endsWith(".rels")) && (xmlBytes += entry.uncompressedSize) > 20 * 1024 * 1024) ||
            entry.uncompressedSize > Math.max(1024, entry.compressedSize) * 100
          )
            return fail(new Error("Office 容器包含不支持的对象或超出解析限制"));
          names.add(name);
          if (name.endsWith("/")) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error) return fail(error);
            let size = 0,
              crc = 0;
            const chunks = [];
            stream.on("data", (chunk) => {
              crc = crc32(chunk, crc);
              size += chunk.length;
              if (size > entry.uncompressedSize) {
                stream.destroy(new Error("容器条目超限"));
                return;
              }
              if (name.endsWith(".xml") || name.endsWith(".rels"))
                chunks.push(chunk);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              if (size !== entry.uncompressedSize || crc !== entry.crc32)
                return fail(new Error("容器条目不完整或校验失败"));
              if (chunks.length)
                xmls.set(name, Buffer.concat(chunks).toString("utf8"));
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          const required =
            kind === "docx" ? "word/document.xml" : "ppt/presentation.xml";
          if (
            !names.has("[Content_Types].xml") ||
            !names.has("_rels/.rels") ||
            !names.has(required) ||
            (kind === "pptx" &&
              ![...names].some((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)))
          )
            return reject(new Error("文件不是完整的 DOCX／PPTX 容器"));
          // Source containers are never executed or converted. Reject entities and external references.
          try {
            for (const text of xmls.values()) {
              if (
                /<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*["']External|<script/i.test(
                  text,
                )
              )
                throw new Error("源件包含外部引用或不支持的活动内容");
              const parser = new SaxesParser({ xmlns: true });
              let depth = 0,
                nodes = 0;
              parser.on("opentag", () => {
                if (++depth > 100 || ++nodes > 200000)
                  throw new Error("XML 结构超限");
              });
              parser.on("closetag", () => depth--);
              parser.write(text).close();
            }
          } catch (e) {
            return reject(e);
          }
          resolve({
            mime:
              kind === "docx"
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            pageCount: null,
          });
        });
        zip.readEntry();
      },
    );
  });
}
try {
  const file = await open(input, "r");
  const { size } = await stat(input);
  if (size < 1 || size > 524288000) throw new Error("文件必须为 1 字节至 500 MiB");
  const header = Buffer.alloc(Math.min(size, 65536));
  await file.read(header, 0, header.length, 0);
  const tail = Buffer.alloc(Math.min(size, 1024));
  await file.read(tail, 0, tail.length, size - tail.length);
  let result;
  if (type === "pdf") {
    if (
      header.subarray(0, 5).toString() !== "%PDF-" ||
      !/%%EOF\s*$/.test(tail.toString("latin1"))
    )
      throw new Error("PDF 签名或结束标记不完整");
    const { getDocument, PDFDataRangeTransport } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    let readBudget = 0;
    class FileRanges extends PDFDataRangeTransport {
      requestDataRange(begin, end) {
        // Bound parser IO, including repeated malicious range requests. Large
        // attachments may still pass when their page structures are small.
        readBudget += end - begin;
        if (readBudget > 128 * 1024 * 1024) { this.abort(); return; }
        const bytes = Buffer.alloc(end - begin);
        file.read(bytes, 0, bytes.length, begin).then(({bytesRead}) => {
          if (bytesRead !== bytes.length) throw new Error("PDF 范围读取不完整");
          this.onDataRange(begin, new Uint8Array(bytes));
        }).catch(() => this.abort());
      }
    }
    const range = new FileRanges(size, new Uint8Array(header), false);
    const task = getDocument({
      range, length: size, rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true,
      enableXfa: false,
      useWasm: false,
      useWorkerFetch: false,
      useSystemFonts: false,
      stopAtErrors: true,
      maxImageSize: 20000000,
      verbosity: 0,
    });
    range.abort = () => { void task.destroy(); };
    const doc = await task.promise;
    if (doc.numPages < 1 || doc.numPages > 200)
      throw new Error("PDF 页数需在 1—200 页");
    if ((await doc.getJSActions()) || (await doc.getAttachments()))
      throw new Error("PDF 含脚本或嵌入附件，不支持作为预览件");
    let operators = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      if (await page.getJSActions()) throw new Error("PDF 页面含脚本");
      const view = page.getViewport({ scale: 1 });
      if (view.width > 14400 || view.height > 14400)
        throw new Error("PDF 页面尺寸超限");
      const ops = await page.getOperatorList();
      operators += ops.fnArray.length;
      if (operators > 1000000) throw new Error("PDF 复杂度超限");
      page.cleanup();
    }
    result = { mime: "application/pdf", pageCount: doc.numPages };
    await task.destroy();
  } else if (["png", "jpeg", "webp"].includes(type)) {
    const image = sharp(input, {
      limitInputPixels: 20000000,
      failOn: "warning",
    }).timeout({ seconds: 45 });
    const meta = await image.metadata();
    if (meta.format !== type || (meta.pages ?? 1) !== 1)
      throw new Error("图片实际格式与声明不一致，或包含多帧");
    // Preserve the original bytes for source downloads. Browsers only receive
    // this decoded/re-encoded derivative, stripping metadata and active payloads.
    await image.rotate().png().toFile(output);
    if ((await stat(output)).size > 80 * 1024 * 1024) throw new Error("安全预览图片超过 80 MiB");
    result = { mime: { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[type], pageCount: 1, normalized: true };
  } else if (["mp4", "mov", "webm"].includes(type)) {
    if ((type === "webm" && header.subarray(0,4).toString("hex") !== "1a45dfa3") ||
        (type !== "webm" && header.subarray(4,8).toString() !== "ftyp")) throw failure("VIDEO_CONTAINER_MISMATCH", "视频容器与扩展名不符，请重新导出 MP4（H.264）后上传");
    const target = videoProbeCommand();
    if (target.error) throw failure(target.error.code, target.error.message);
    const metadata = await new Promise((resolve,reject) => execFile(target.command,
      ["-v","error","-protocol_whitelist","file",...(type === "webm" ? [] : ["-enable_drefs","0","-use_absolute_path","0"]),"-show_streams","-show_format","-of","json",input],
      {timeout:60000,maxBuffer:256*1024}, (err,out,stderr) => {
        if (err) {
          const problem = classifyVideoProbeFailure(err, stderr);
          return reject(problem ? failure(problem.code, problem.message)
            : failure("VIDEO_CORRUPT", "无法解析视频内容，请检查文件是否完整并重新导出"));
        }
        try {
          const value = JSON.parse(out);
          if (!value || !Array.isArray(value.streams) || !value.format || typeof value.format.format_name !== "string" || value.streams.some(stream => !stream || typeof stream.codec_type !== "string")) throw new Error("Invalid probe result");
          resolve(value);
        } catch { reject(failure("VIDEO_PROBE_INVALID_RESULT", "服务端视频检查结果无效，请联系管理员检查工具配置")); }
      }));
    const streams = metadata.streams ?? [], videos = streams.filter(s => s.codec_type === "video");
    const formats = String(metadata.format?.format_name ?? "").split(",");
    if (!(type === "webm" ? formats.includes("webm") : formats.includes("mp4") || formats.includes("mov")))
      throw failure("VIDEO_CONTAINER_MISMATCH", "实际视频容器与文件扩展名不符，请重新导出 MP4（H.264）后上传");
    if (videos.length !== 1 || streams.length > 2 || streams.some(s => !["video","audio"].includes(s.codec_type)))
      throw failure("VIDEO_TRACKS_UNSUPPORTED", "请导出一条视频轨道和最多一条音频轨道，不附带附件或其他轨道");
    const video = videos[0], duration = Number(metadata.format?.duration);
    const codecs = type === "webm" ? ["vp8","vp9"] : ["h264"];
    const audio = type === "webm" ? ["opus","vorbis"] : ["aac","mp3"];
    const codecLabel = value => typeof value === "string" && /^[a-z0-9_-]{1,32}$/i.test(value) ? value.toUpperCase() : "未知";
    if (!codecs.includes(video.codec_name))
      throw failure("VIDEO_CODEC_UNSUPPORTED", `视频编码不支持（检测到 ${codecLabel(video.codec_name)}）；${type === "webm" ? "WebM 请导出 VP8/VP9" : "MP4/MOV 请导出 H.264"}，系统不自动转码`);
    const unsupportedAudio = streams.find(s => s.codec_type === "audio" && !audio.includes(s.codec_name));
    if (unsupportedAudio)
      throw failure("VIDEO_AUDIO_CODEC_UNSUPPORTED", `音频编码不支持（检测到 ${codecLabel(unsupportedAudio.codec_name)}）；${type === "webm" ? "WebM 使用 Opus/Vorbis" : "MP4/MOV 使用 AAC/MP3"}，也可导出无音轨视频`);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 4*60*60 || !Number.isFinite(video.width) || !Number.isFinite(video.height) || video.width <= 0 || video.height <= 0 || video.width > 3840 || video.height > 2160 ||
        !["yuv420p","yuvj420p"].includes(video.pix_fmt)) throw failure("VIDEO_LIMIT_UNSUPPORTED", "视频参数不受支持：要求时长大于 0 且不超过 4 小时、分辨率不超过 3840×2160、像素格式为 YUV420P（8 位 4:2:0）");
    result = {mime:{mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm"}[type],pageCount:null};
  } else result = await office(input, type);
  await file.close();
  process.stdout.write(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  const message = error instanceof Error ? error.message : "文件解析失败";
  const videoFailure = ["mp4", "mov", "webm"].includes(type);
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: videoFailure && !/^\[VIDEO_[A-Z_]+\]/.test(message)
        ? "[VIDEO_PROCESSING_FAILED] 服务端读取或检查视频失败，请管理员检查存储与运行配置"
        : message,
    }),
  );
  process.exitCode = 1;
}
