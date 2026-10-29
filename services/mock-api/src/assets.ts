import { createReadStream, mkdtempSync, mkdirSync } from "node:fs";
import { open, rename, stat, statfs, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { IncomingMessage } from "node:http";
import type { Domain, Responses } from "@zj/contracts";
import { MAX_ASSET_BYTES, UPLOAD_BUDGET_BYTES, CHECK_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from "./asset-limits";
import { AppError, requireValue, clone } from "./errors";
type Upload = Responses["UploadResult"] & {
  productId: string;
  purpose: Domain["UploadIntent"]["purpose"];
  declaredSize: number;
  declaredMime: string;
  type: string;
  fileExtension?: string;
  path: string;
  writing: boolean;
  preview?: { path?: string; size: number; checksum: string; mimeType: string };
};
const formats: Record<
  string,
  { mime: string; type: string; limit: number; purposes: string[] }
> = {
  pdf: {
    mime: "application/pdf",
    type: "pdf",
    limit: MAX_ASSET_BYTES,
    purposes: ["preview"],
  },
  png: {
    mime: "image/png",
    type: "png",
    limit: MAX_ASSET_BYTES,
    purposes: ["preview", "media"],
  },
  jpg: {
    mime: "image/jpeg",
    type: "jpeg",
    limit: MAX_ASSET_BYTES,
    purposes: ["preview", "media"],
  },
  jpeg: {
    mime: "image/jpeg",
    type: "jpeg",
    limit: MAX_ASSET_BYTES,
    purposes: ["preview", "media"],
  },
  webp: {
    mime: "image/webp",
    type: "webp",
    limit: MAX_ASSET_BYTES,
    purposes: ["preview", "media"],
  },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    type: "docx",
    limit: MAX_ASSET_BYTES,
    purposes: ["source"],
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    type: "pptx",
    limit: MAX_ASSET_BYTES,
    purposes: ["source"],
  },
  mp4: { mime: "video/mp4", type: "mp4", limit: MAX_ASSET_BYTES, purposes: ["preview"] },
  mov: { mime: "video/quicktime", type: "mov", limit: MAX_ASSET_BYTES, purposes: ["preview"] },
  webm: { mime: "video/webm", type: "webm", limit: MAX_ASSET_BYTES, purposes: ["preview"] },
};
export class AssetStore {
  readonly uploads = new Map<string, Upload>();
  readonly directory: string;
  private reserved = 0;
  constructor() {
    const root = resolve("work/mock-assets");
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.directory = mkdtempSync(join(root, "session-"));
  }
  result(u: Upload): Responses["UploadResult"] {
    return clone({
      uploadId: u.uploadId,
      assetId: u.assetId,
      status: u.status,
      size: u.size,
      mimeType: u.mimeType,
      checksum: u.checksum,
      pageCount: u.pageCount,
      error: u.error,
    });
  }
  create(intent: Domain["UploadIntent"]): Responses["UploadIntentResult"] {
    requireValue(
      !/[\\/\u0000-\u001f]/.test(intent.fileName),
      400,
      "INVALID_ARGUMENT",
      "文件名不能包含路径或控制字符",
    );
    const ext = intent.fileName.split(".").pop()?.toLowerCase() ?? "",
      format = formats[ext];
    requireValue(
      format &&
        format.mime === intent.contentType &&
        format.purposes.includes(intent.purpose),
      422,
      "VALIDATION_FAILED",
      "不支持该文件类型或用途",
    );
    requireValue(
      intent.size <= format.limit,
      413,
      "FILE_TOO_LARGE",
      "单个文件不能超过 500 MiB（524,288,000 字节）",
    );
    requireValue(
      this.uploads.size < 500 &&
        this.reserved + intent.size <= UPLOAD_BUDGET_BYTES,
      429,
      "RATE_LIMITED",
      "本地会话上传额度已满，请使用新的开发会话",
    );
    const uploadId = randomUUID(),
      assetId = randomUUID();
    this.uploads.set(uploadId, {
      uploadId,
      assetId,
      status: "UPLOADING",
      size: null,
      mimeType: null,
      checksum: null,
      pageCount: null,
      error: null,
      productId: intent.productId,
      purpose: intent.purpose,
      declaredSize: intent.size,
      declaredMime: intent.contentType,
      type: format.type,
      fileExtension: intent.fileName.split(".").pop(),
      path: join(this.directory, assetId),
      writing: false,
    });
    this.reserved += intent.size;
    return {
      uploadId,
      assetId,
      status: "UPLOADING",
      uploadPath: "/api/v1/admin/uploads/" + uploadId + "/content",
      uploadMethod: "PUT",
    };
  }
  get(id: string) {
    const u = this.uploads.get(id);
    requireValue(u, 404, "RESOURCE_UNAVAILABLE", "上传任务不存在");
    return u;
  }
  asset(productId: string, id: string, purpose?: string) {
    const u = [...this.uploads.values()].find((a) => a.assetId === id);
    requireValue(
      u &&
        u.productId === productId &&
        u.status === "READY" &&
        (!purpose || u.purpose === purpose),
      422,
      "VALIDATION_FAILED",
      "资产不可用、用途不符或属于其他产品",
    );
    return u;
  }
  private activeWrites = 0;
  async put(id: string, req: IncomingMessage) {
    requireValue(this.activeWrites < 2, 429, "UPLOAD_BUSY", "同时最多上传两个文件，请稍后重试");
    this.activeWrites++;
    try { return await this.putFile(id, req); } finally { this.activeWrites--; }
  }
  private async putFile(id: string, req: IncomingMessage) {
    const u = this.get(id);
    requireValue(
      u.status === "UPLOADING" && !u.writing,
      409,
      "INVALID_STATE",
      "文件已写入或正在处理，不能原位覆盖",
    );
    requireValue(
      req.headers["content-type"]?.split(";")[0] === "application/octet-stream",
      400,
      "INVALID_ARGUMENT",
      "上传需使用二进制流",
    );
    if (req.headers["content-length"])
      requireValue(
        Number(req.headers["content-length"]) === u.declaredSize,
        422,
        "VALIDATION_FAILED",
        "实际文件大小与声明不符",
      );
    const disk = await statfs(this.directory);
    requireValue(disk.bavail * disk.bsize > u.declaredSize + 256 * 1024 * 1024, 507, "STORAGE_FULL", "临时存储空间不足，请稍后重试");
    u.writing = true;
    const deadline = setTimeout(() => req.destroy(new Error("上传超过 15 分钟")), UPLOAD_TIMEOUT_MS);
    req.setTimeout?.(30000, () => req.destroy(new Error("上传 30 秒未收到数据")));
    const temp = u.path + ".part";
    let file;
    try {
      file = await open(temp, "wx", 0o600);
      let count = 0;
      for await (const chunk of req) {
        count += chunk.length;
        if (count > u.declaredSize)
          throw new AppError(413, "FILE_TOO_LARGE", "上传字节超出声明大小");
        let offset = 0;
        while (offset < chunk.length) {
          const written = await file.write(chunk, offset, chunk.length - offset);
          offset += written.bytesWritten;
        }
      }
      requireValue(
        count === u.declaredSize,
        422,
        "VALIDATION_FAILED",
        "文件不完整",
      );
      await file.close();
      file = undefined;
      await rename(temp, u.path);
      u.status = "CHECKING";
      u.size = count;
      return this.result(u);
    } catch (e) {
      await file?.close();
      await unlink(temp).catch(() => {});
      throw e;
    } finally {
      clearTimeout(deadline);
      u.writing = false;
    }
  }
  private processing = 0;
  private pending = new Map<string, Promise<Responses["UploadResult"]>>();
  async complete(id: string): Promise<Responses["UploadResult"]> {
    const u = this.get(id);
    if (u.status === "READY" || u.status === "REJECTED") return this.result(u);
    requireValue(
      u.status === "CHECKING",
      409,
      "INVALID_STATE",
      "请先完成文件字节上传",
    );
    if (this.pending.has(id)) return this.pending.get(id)!;
    requireValue(
      this.processing < 2,
      429,
      "RATE_LIMITED",
      "文件检查繁忙，请稍后重试",
    );
    this.processing++;
    const task = (async () => {
      const normalized = u.path + ".preview.png";
      try {
        const parsed = await new Promise<{
          ok: boolean;
          error?: string;
          mime: string;
          pageCount: number | null;
          normalized?: boolean;
        }>((resolve, reject) => {
          execFile(
            process.execPath,
            [
              "--max-old-space-size=384",
              fileURLToPath(new URL("./parse-file.mjs", import.meta.url)),
              u.path,
              normalized,
              u.type,
            ],
            { timeout: CHECK_TIMEOUT_MS, maxBuffer: 16384, env: { ...process.env, NODE_OPTIONS: "" } },
            (error, stdout) => {
              try {
                const data = JSON.parse(stdout.trim().split("\n").at(-1)!);
                if (!data.ok) reject(new Error(data.error));
                else if (error) reject(error);
                else resolve(data);
              } catch {
                reject(new Error("文件无法解析、缺少受信任解析工具或超过 120 秒处理限制"));
              }
            },
          );
        });
        if (parsed.normalized) {
          const { size: previewSize } = await stat(normalized);
          const previewHash = createHash("sha256");
          for await (const chunk of createReadStream(normalized)) previewHash.update(chunk);
          u.preview = { path: normalized, size: previewSize, checksum: previewHash.digest("hex"), mimeType: "image/png" };
        }
        const { size } = await stat(u.path);
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(u.path)) hash.update(chunk);
        const extra = Math.max(0, size - u.declaredSize) + (u.preview?.size ?? 0);
        requireValue(
          this.reserved + extra <= UPLOAD_BUDGET_BYTES,
          429,
          "RATE_LIMITED",
          "规范化文件超过本地会话额度",
        );
        this.reserved += extra;
        u.mimeType = parsed.mime;
        u.pageCount = parsed.pageCount;
        u.size = size;
        u.checksum = hash.digest("hex");
        u.status = "READY";
      } catch (e) {
        u.status = "REJECTED";
        u.error = e instanceof Error ? e.message : "文件检查失败";
        await unlink(u.path).catch(() => {});
        await unlink(normalized).catch(() => {});
        this.reserved = Math.max(0, this.reserved - u.declaredSize);
      }
      return this.result(u);
    })();
    this.pending.set(id, task);
    try {
      return await task;
    } finally {
      this.pending.delete(id);
      this.processing--;
    }
  }
  async bytes(productId: string, assetId: string, original = false) {
    const u = this.asset(productId, assetId);
    const path = !original && u.preview?.path ? u.preview.path : u.path;
    const size = (await stat(path)).size;
    return { upload: !original && u.preview ? { ...u, mimeType: u.preview.mimeType } : u, size, path };
  }
}
