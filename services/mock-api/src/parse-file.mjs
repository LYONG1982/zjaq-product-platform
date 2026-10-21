// Runs in a bounded subprocess. No network URLs or executable document actions are accepted.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import yauzl from "yauzl";
import { SaxesParser } from "saxes";
import { crc32 } from "node:zlib";
const [input, output, type] = process.argv.slice(2);
async function office(buffer, kind) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => {
        if (err) return reject(new Error("Office 文件容器损坏"));
        let total = 0,
          count = 0;
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
            (total += entry.uncompressedSize) > 100 * 1024 * 1024 ||
            entry.uncompressedSize > 20 * 1024 * 1024 ||
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
              if (size > entry.uncompressedSize || size > 20 * 1024 * 1024) {
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
  const bytes = await readFile(input);
  let result;
  if (type === "pdf") {
    if (
      bytes.subarray(0, 5).toString() !== "%PDF-" ||
      !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))
    )
      throw new Error("PDF 签名或结束标记不完整");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      enableXfa: false,
      useWasm: false,
      useWorkerFetch: false,
      useSystemFonts: false,
      stopAtErrors: true,
      maxImageSize: 20000000,
      verbosity: 0,
    });
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
    const image = sharp(bytes, {
      limitInputPixels: 20000000,
      failOn: "warning",
    }).timeout({ seconds: 10 });
    const meta = await image.metadata();
    if (meta.format !== type || (meta.pages ?? 1) !== 1)
      throw new Error("图片实际格式与声明不一致，或包含多帧");
    const cleaned = await image.rotate().png().toBuffer();
    if (cleaned.length > 8 * 1024 * 1024)
      throw new Error("规范化图片超过 8 MiB");
    await writeFile(output, cleaned, { flag: "wx", mode: 0o600 });
    result = { mime: "image/png", pageCount: 1, normalized: true };
  } else result = await office(bytes, type);
  process.stdout.write(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "文件解析失败",
    }),
  );
  process.exitCode = 1;
}
