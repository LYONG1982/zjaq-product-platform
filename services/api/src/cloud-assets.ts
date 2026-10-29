import { randomUUID, createHash } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { AssetCache } from "./asset-cache";
import { MAX_ASSET_BYTES } from "../../mock-api/src/asset-limits";
import { AssetStore } from "../../mock-api/src/assets";
import { requireValue, clone } from "../../domain/src/errors";
import type { Repository, Transaction } from "./repository";
export type StoredAsset = Omit<
  ReturnType<AssetStore["get"]>,
  "path" | "writing"
> & { fileId?: string; previewFileId?: string; lease?: { id: string; until: number } };
export interface PrivateStorage {
  upload(path: string, filePath: string): Promise<string>;
  download(fileId: string, path: string): Promise<void>;
  remove?(fileIds: string[]): Promise<void>;
}
export function persisted(
  u: ReturnType<AssetStore["get"]>,
  fileId?: string,
): StoredAsset {
  const { path, writing, fileId: previousFile, previewFileId: previousPreview, lease: previousLease, ...rest } = u as typeof u & Partial<StoredAsset>;
  if (rest.preview) { const { path: previewPath, ...preview } = rest.preview; rest.preview = preview; }
  return { ...clone(rest), ...(fileId ? { fileId } : {}) };
}
export async function advance(tx: Transaction) {
  const control = await tx.get<{
    revision: number;
    ready: boolean;
    maintenance?: boolean;
  }>("control", "state");
  requireValue(
    control?.ready && !control.maintenance,
    503,
    "NOT_INITIALIZED",
    "环境未初始化或正在维护",
  );
  await tx.set("control", "state", {
    ...control,
    revision: control.revision + 1,
  });
}
export class CloudAssets {
  private activeUploads = 0;
  private activeChecks = 0;
  constructor(
    private repo: Repository,
    private storage: PrivateStorage,
  ) {}
  async get(id: string) {
    const index = await this.repo.get<{ assetId: string }>("uploads", id);
    const u = index
      ? await this.repo.get<StoredAsset>("assets", index.assetId)
      : undefined;
    requireValue(u, 404, "RESOURCE_UNAVAILABLE", "上传任务不存在");
    return u;
  }
  async result(id: string) {
    const local = new AssetStore();
    try {
      return local.result({
        ...(await this.get(id)),
        path: "",
        writing: false,
      });
    } finally {
      if (local) await rm(local.directory, { recursive: true, force: true });
    }
  }
  async lease(id: string, status: "UPLOADING" | "CHECKING") {
    const u = await this.get(id);
    const leaseId = randomUUID();
    return this.repo.transaction(async (tx) => {
      const current = await tx.get<StoredAsset>("assets", u.assetId);
      const product = await tx.get<{ deletedAt?: string | null }>("products", u.productId);
      requireValue(!product?.deletedAt, 409, "PRODUCT_REMOVED", "产品已移除，不能继续上传");
      requireValue(
        current?.status === status,
        409,
        "INVALID_STATE",
        "上传状态已变化",
      );
      requireValue(
        !current.lease || current.lease.until < Date.now(),
        409,
        "UPLOAD_BUSY",
        "文件正在处理，请稍后重试",
      );
      const leased = {
        ...current,
        lease: { id: leaseId, until: Date.now() + 40 * 60 * 1000 },
      };
      await advance(tx);
      await tx.set("assets", u.assetId, leased);
      return leased;
    });
  }
  private async commit(old: StoredAsset, next: StoredAsset) {
    await this.repo.transaction(async (tx) => {
      const current = await tx.get<StoredAsset>("assets", old.assetId);
      const product = await tx.get<{ deletedAt?: string | null }>("products", old.productId);
      requireValue(!product?.deletedAt, 409, "PRODUCT_REMOVED", "产品已移除，不能提交上传结果");
      requireValue(
        current?.lease?.id === old.lease?.id,
        409,
        "UPLOAD_BUSY",
        "处理租约已变化，请重试",
      );
      await advance(tx);
      if (next.status === "READY" && next.preview && current?.status !== "READY") {
        const quotaId = "upload-" + new Date().toISOString().slice(0,10);
        const quota = await tx.get<{ count: number; bytes: number }>("control",quotaId) ?? {count:0,bytes:0};
        requireValue(quota.bytes + next.preview.size <= 4 * 1024 * 1024 * 1024, 429, "UPLOAD_QUOTA", "安全预览超过今日存储额度，请联系维护人员");
        await tx.set("control",quotaId,{...quota,bytes:quota.bytes+next.preview.size});
      }
      const { lease, ...value } = next;
      await tx.set("assets", old.assetId, value);
    });
  }
  async put(id: string, req: IncomingMessage) {
    requireValue(
      this.activeUploads < 4,
      429,
      "UPLOAD_BUSY",
      "上传繁忙，请稍后重试",
    );
    this.activeUploads++;
    try {
      return await this.putFile(id, req);
    } finally {
      this.activeUploads--;
    }
  }
  private async putFile(id: string, req: IncomingMessage) {
    const u = await this.lease(id, "UPLOADING");
    let local: AssetStore | undefined;
    let storedId: string | undefined;
    try {
      local = new AssetStore();
      const file = join(local.directory, u.assetId);
      local.uploads.set(id, { ...u, path: file, writing: false });
      await local.put(id, req);
      const fileId = storedId = await this.storage.upload(
        "private/raw/" + u.assetId + "/" + randomUUID(),
        file,
      );
      const next = persisted(local.get(id), fileId);
      await this.commit(u, next);
      return local.result(local.get(id));
    } catch (error) {
      if (storedId) await this.storage.remove?.([storedId]).catch(() => {});
      await this.release(u);
      throw error;
    } finally {
      if (local) await rm(local.directory, { recursive: true, force: true });
    }
  }
  async complete(id: string) {
    requireValue(
      this.activeChecks < 2,
      429,
      "UPLOAD_BUSY",
      "文件检查繁忙，请稍后重试",
    );
    this.activeChecks++;
    try {
      return await this.checkFile(id);
    } finally {
      this.activeChecks--;
    }
  }
  private async checkFile(id: string) {
    const existing = await this.get(id);
    if (existing.status === "READY" || existing.status === "REJECTED")
      return this.result(id);
    const u = await this.lease(id, "CHECKING");
    let local: AssetStore | undefined;
    try {
      local = new AssetStore();
      requireValue(u.fileId, 409, "INVALID_STATE", "文件字节尚未就绪");
      const path = join(local.directory, u.assetId);
      await this.storage.download(u.fileId, path);
      requireValue(
        (await stat(path)).size === u.declaredSize,
        422,
        "VALIDATION_FAILED",
        "对象大小与声明不一致",
      );
      local.uploads.set(id, { ...u, path, writing: false });
      const result = await local.complete(id);
      let previewFileId: string | undefined;
      try {
        const derivative = local.get(id).preview;
        if (result.status === "READY" && derivative?.path)
          previewFileId = await this.storage.upload("private/preview/" + u.assetId + "/" + randomUUID(), derivative.path);
        await this.commit(u, { ...persisted(local.get(id), result.status === "READY" ? u.fileId : undefined), ...(previewFileId ? { previewFileId } : {}) });
      } catch (error) {
        if (previewFileId) await this.storage.remove?.([previewFileId]).catch(() => {});
        throw error;
      }
      if (result.status === "REJECTED") await this.storage.remove?.([u.fileId]).catch(() => {});
      return result;
    } catch (error) {
      await this.release(u);
      throw error;
    } finally {
      if (local) await rm(local.directory, { recursive: true, force: true });
    }
  }
  private async release(old: StoredAsset) {
    await this.repo.transaction(async tx => {
      const current = await tx.get<StoredAsset>("assets", old.assetId);
      if (current && current.lease?.id === old.lease?.id) {
        const { lease, ...unlocked } = current;
        await advance(tx);
        await tx.set("assets", old.assetId, unlocked);
      }
    });
  }
  private cache = new AssetCache();
  async close() { await this.cache.close(); }
  async bytes(productId: string, assetId: string, original = false) {
    const u = await this.repo.get<StoredAsset>("assets", assetId);
    requireValue(u?.status === "READY" && u.productId === productId && u.fileId, 404, "RESOURCE_UNAVAILABLE", "资料不可用");
    const preview = !original && u.preview && u.previewFileId ? u.preview : undefined;
    const fileId = preview ? u.previewFileId! : u.fileId;
    const size = preview?.size ?? u.size;
    const checksum = preview?.checksum ?? u.checksum;
    requireValue(size && size <= MAX_ASSET_BYTES && checksum, 422, "VALIDATION_FAILED", "文件元数据无效");
    const key = createHash("sha256").update(JSON.stringify([assetId,fileId,size,checksum])).digest("hex");
    const cached = await this.cache.acquire(key,size,checksum,path=>this.storage.download(fileId,path));
    return { ...cached, upload: { ...u, ...(preview ? { mimeType: preview.mimeType } : {}), path: cached.path, writing: false } };
  }
}
