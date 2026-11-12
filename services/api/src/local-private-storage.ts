import { copyFile, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { MAX_ASSET_BYTES } from "../../domain/src/asset-limits";
import { requireValue } from "../../domain/src/errors";
import type { PrivateStorage } from "./asset-repository";

/** 私有文件存放于独立目录，路径按散列前缀分层，避免单目录过多文件。 */
export class LocalPrivateStorage implements PrivateStorage {
  readonly root: string;
  constructor(directory = process.env.ZJ_STORAGE_DIR ?? "work/storage") {
    this.root = resolve(directory);
  }
  private target(fileId: string) {
    requireValue(/^[A-Za-z0-9._-]{1,120}$/.test(fileId), 500, "CONFIGURATION_ERROR", "文件标识无效");
    return join(this.root, "objects", fileId.slice(0, 2), fileId.slice(2, 4), fileId);
  }
  async upload(_path: string, filePath: string) {
    const fileId = randomUUID();
    const source = await stat(filePath);
    requireValue(source.size <= MAX_ASSET_BYTES, 413, "FILE_TOO_LARGE", "文件超过存储上限");
    const target = this.target(fileId);
    await mkdir(dirname(target), { recursive: true });
    const temporary = target + ".part";
    await copyFile(filePath, temporary);
    await rename(temporary, target);
    return fileId;
  }
  async download(fileId: string, path: string) {
    const target = this.target(fileId);
    const info = await stat(target).catch(() => undefined);
    requireValue(info?.isFile(), 404, "RESOURCE_UNAVAILABLE", "文件不存在或已被清理");
    await mkdir(dirname(path), { recursive: true });
    await copyFile(target, path);
  }
  async remove(fileIds: string[]) {
    for (const fileId of fileIds) await rm(this.target(fileId), { force: true });
  }
  /** 站点默认图等静态字节落盘，返回可再次读取的标识。 */
  async putBytes(bytes: Buffer) {
    const fileId = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
    const target = this.target(fileId);
    await mkdir(dirname(target), { recursive: true });
    const temporary = target + ".part";
    await writeFile(temporary, bytes);
    await rename(temporary, target);
    return fileId;
  }
}
