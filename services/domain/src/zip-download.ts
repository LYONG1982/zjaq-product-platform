import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { crc32 } from "node:zlib";
import type { ServerResponse } from "node:http";
import type { Backend } from "./backend";
import { requireValue } from "./errors";
function u64(value: number) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; }
function header(signature: number, length: number) { const b = Buffer.alloc(length); b.writeUInt32LE(signature); return b; }
/** ZIP64 stored entries: one file on disk and bounded 64 KiB chunks, no archive buffer. */
export async function zipDownload(store: Backend, productId: string, assetIds: string[], res: ServerResponse, checkCurrent: () => Promise<void>, name: string) {
  requireValue(assetIds.length > 0 && assetIds.length <= 200, 404, "RESOURCE_UNAVAILABLE", "图片资料不可用");
  await checkCurrent();
  const deadline=setTimeout(()=>res.destroy(),15*60*1000);deadline.unref();res.setTimeout(30000,()=>res.destroy());res.once("close",()=>clearTimeout(deadline));
  const safeName = name.replace(/[\u0000-\u001f\u007f/\\]/g, " ").trim().slice(0, 80) || "material";
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="material.zip"; filename*=UTF-8''${encodeURIComponent(safeName + ".zip").replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16))}`);
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  res.setHeader("Accept-Ranges", "none");
  const entries: { name: Buffer; size: number; crc: number; offset: number }[] = [];
  async function* archive() {
    let offset = 0;
    for (const [index, assetId] of assetIds.entries()) {
      await checkCurrent();
      const file = await store.bytes(productId, assetId, true);
      try {
        if (res.destroyed) return;
        requireValue(file.upload.purpose === "preview" && file.upload.mimeType?.startsWith("image/"), 404, "RESOURCE_UNAVAILABLE", "图片资料不可用");
        const ext = file.upload.fileExtension && ["png", "jpg", "jpeg", "webp"].includes(file.upload.fileExtension.toLowerCase()) ? file.upload.fileExtension : file.upload.type === "jpeg" ? "jpg" : file.upload.type;
        const fileName = Buffer.from(String(index + 1).padStart(3, "0") + "." + ext);
        const extra = Buffer.concat([Buffer.from([1, 0, 16, 0]), u64(file.size), u64(file.size)]);
        const local = header(0x04034b50, 30); local.writeUInt16LE(45, 4); local.writeUInt16LE(0x808, 6);
        local.writeUInt32LE(0xffffffff, 18); local.writeUInt32LE(0xffffffff, 22); local.writeUInt16LE(fileName.length, 26); local.writeUInt16LE(extra.length, 28);
        const position = offset;
        yield local; yield fileName; yield extra; offset += local.length + fileName.length + extra.length;
        let crc = 0, size = 0;
        for await (const chunk of createReadStream(file.path)) { size += chunk.length; crc = crc32(chunk, crc); yield chunk; offset += chunk.length; }
        requireValue(size === file.size, 422, "VALIDATION_FAILED", "图片字节不完整");
        const descriptor = Buffer.concat([header(0x08074b50, 4), u64(0).subarray(0,4), u64(size), u64(size)]); descriptor.writeUInt32LE(crc, 4);
        yield descriptor; offset += descriptor.length;
        entries.push({name:fileName,size,crc,offset:position});
      } finally { await file.cleanup?.(); }
    }
    const centralStart = offset;
    for (const entry of entries) {
      const extra = Buffer.concat([Buffer.from([1,0,24,0]),u64(entry.size),u64(entry.size),u64(entry.offset)]);
      const central = header(0x02014b50,46); central.writeUInt16LE(45,4); central.writeUInt16LE(45,6); central.writeUInt16LE(0x808,8); central.writeUInt32LE(entry.crc,16);
      central.writeUInt32LE(0xffffffff,20);central.writeUInt32LE(0xffffffff,24);central.writeUInt16LE(entry.name.length,28);central.writeUInt16LE(extra.length,30);central.writeUInt32LE(0xffffffff,42);
      yield central;yield entry.name;yield extra;offset += central.length+entry.name.length+extra.length;
    }
    const centralSize = offset-centralStart;
    const end64 = header(0x06064b50,56);u64(44).copy(end64,4);end64.writeUInt16LE(45,12);end64.writeUInt16LE(45,14);u64(entries.length).copy(end64,24);u64(entries.length).copy(end64,32);u64(centralSize).copy(end64,40);u64(centralStart).copy(end64,48);
    yield end64;
    const locator = header(0x07064b50,20);u64(offset).copy(locator,8);locator.writeUInt32LE(1,16);yield locator;
    const end = header(0x06054b50,22);end.writeUInt16LE(0xffff,8);end.writeUInt16LE(0xffff,10);end.writeUInt32LE(0xffffffff,12);end.writeUInt32LE(0xffffffff,16);yield end;
  }
  const stream = Readable.from(archive());
  res.on("close", () => stream.destroy());
  stream.on("error", () => res.destroy());
  res.writeHead(200);
  stream.pipe(res);
}
