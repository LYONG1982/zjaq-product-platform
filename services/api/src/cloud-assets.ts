import { randomUUID, createHash } from "node:crypto";
import { rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { AssetStore } from "../../mock-api/src/assets";
import { requireValue, clone } from "../../domain/src/errors";
import type { Repository, Transaction } from "./repository";
export type StoredAsset = Omit<
  ReturnType<AssetStore["get"]>,
  "path" | "writing"
> & { fileId?: string; lease?: { id: string; until: number } };
export interface PrivateStorage {
  upload(path: string, bytes: Buffer): Promise<string>;
  download(fileId: string, path: string): Promise<void>;
}
export function persisted(
  u: ReturnType<AssetStore["get"]>,
  fileId?: string,
): StoredAsset {
  const { path, writing, ...rest } = u;
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
      await rm(local.directory, { recursive: true, force: true });
    }
  }
  async lease(id: string, status: "UPLOADING" | "CHECKING") {
    const u = await this.get(id);
    const leaseId = randomUUID();
    return this.repo.transaction(async (tx) => {
      const current = await tx.get<StoredAsset>("assets", u.assetId);
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
        lease: { id: leaseId, until: Date.now() + 120000 },
      };
      await advance(tx);
      await tx.set("assets", u.assetId, leased);
      return leased;
    });
  }
  private async commit(old: StoredAsset, next: StoredAsset) {
    await this.repo.transaction(async (tx) => {
      const current = await tx.get<StoredAsset>("assets", old.assetId);
      requireValue(
        current?.lease?.id === old.lease?.id,
        409,
        "UPLOAD_BUSY",
        "处理租约已变化，请重试",
      );
      await advance(tx);
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
    const u = await this.lease(id, "UPLOADING"),
      local = new AssetStore();
    try {
      const file = join(local.directory, u.assetId);
      local.uploads.set(id, { ...u, path: file, writing: false });
      await local.put(id, req);
      const fileId = await this.storage.upload(
        "private/raw/" + u.assetId + "/" + randomUUID(),
        await readFile(file),
      );
      const next = persisted(local.get(id), fileId);
      await this.commit(u, next);
      return local.result(local.get(id));
    } finally {
      await rm(local.directory, { recursive: true, force: true });
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
    const u = await this.lease(id, "CHECKING"),
      local = new AssetStore();
    try {
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
      let fileId = u.fileId;
      if (result.status === "READY")
        fileId = await this.storage.upload(
          "private/ready/" + u.assetId + "/" + randomUUID(),
          await readFile(path),
        );
      await this.commit(u, persisted(local.get(id), fileId));
      return result;
    } finally {
      await rm(local.directory, { recursive: true, force: true });
    }
  }
  async bytes(productId: string, assetId: string) {
    const u = await this.repo.get<StoredAsset>("assets", assetId);
    requireValue(
      u?.status === "READY" && u.productId === productId && u.fileId,
      404,
      "RESOURCE_UNAVAILABLE",
      "资料不可用",
    );
    const local = new AssetStore(),
      path = join(local.directory, assetId);
    try {
      await this.storage.download(u.fileId, path);
      const size = (await stat(path)).size;
      requireValue(
        size === u.size &&
          size <= 50 * 1024 * 1024 &&
          createHash("sha256")
            .update(await readFile(path))
            .digest("hex") === u.checksum,
        422,
        "VALIDATION_FAILED",
        "文件完整性检查未通过",
      );
      return {
        path,
        size,
        upload: { ...u, path, writing: false },
        cleanup: () => rm(local.directory, { recursive: true, force: true }),
      };
    } catch (e) {
      await rm(local.directory, { recursive: true, force: true });
      throw e;
    }
  }
}
