import { constants, createReadStream } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { validateBackup } from "./backup-validation";

/** Verify every private byte before a maintenance write. Hash one stream at a time. */
export async function verifyBackupObjects(backup: ReturnType<typeof validateBackup>, backupPath: string) {
  if (!backup.files.length) return { verified: 0 };
  const root = resolve(backupPath + ".assets"), directory = await lstat(root).catch(() => null);
  if (!directory?.isDirectory() || directory.isSymbolicLink()) throw new Error("BACKUP_OBJECT_DIRECTORY_MISSING_OR_UNSAFE");
  for (const item of backup.files) {
    if (!/^[a-f0-9-]{36}$/.test(item.assetId) || (item.variant !== undefined && item.variant !== "preview")) throw new Error("INVALID_BACKUP_OBJECT_PATH");
    const path = resolve(root, item.assetId + (item.variant === "preview" ? ".preview" : ""));
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => null);
    if (!file) throw new Error("BACKUP_OBJECT_MISSING_OR_UNSAFE");
    try {
      const before = await file.stat();
      if (!before.isFile()) throw new Error("BACKUP_OBJECT_NOT_A_FILE");
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(path, { fd: file.fd, autoClose: false })) hash.update(bytes);
      const after = await file.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("BACKUP_OBJECT_CHANGED_DURING_VERIFICATION");
      if (hash.digest("hex") !== item.sha256) throw new Error("BACKUP_OBJECT_CHECKSUM_MISMATCH");
    } finally { await file.close(); }
  }
  return { verified: backup.files.length };
}
