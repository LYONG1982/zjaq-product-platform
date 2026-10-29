import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { verifyBackupObjects } from "../../services/api/src/backup-objects";
import type { validateBackup } from "../../services/api/src/backup-validation";

test("maintenance backup verification requires intact original and derived objects, with bounded streaming", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zj-backup-objects-")), backupPath = join(directory, "backup.json");
  const assetId = randomUUID(), original = Buffer.from("private source test fixture"), preview = Buffer.from("derived safe preview fixture");
  const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const backup = { files: [
    { assetId, fileId: "test-original", sha256: digest(original) },
    { assetId, fileId: "test-preview", sha256: digest(preview), variant: "preview" },
  ] } as ReturnType<typeof validateBackup>;
  try {
    await assert.rejects(verifyBackupObjects(backup, backupPath), /DIRECTORY_MISSING/);
    await mkdir(backupPath + ".assets");
    const sourcePath = join(backupPath + ".assets", assetId), previewPath = sourcePath + ".preview";
    await writeFile(sourcePath, original);
    await assert.rejects(verifyBackupObjects(backup, backupPath), /OBJECT_MISSING/);
    await writeFile(previewPath, preview);
    assert.deepEqual(await verifyBackupObjects(backup, backupPath), { verified: 2 });
    await writeFile(previewPath, "corrupt preview");
    await assert.rejects(verifyBackupObjects(backup, backupPath), /CHECKSUM_MISMATCH/);
    await rm(previewPath); await symlink(sourcePath, previewPath);
    await assert.rejects(verifyBackupObjects(backup, backupPath), /OBJECT_MISSING_OR_UNSAFE/);
    await rm(previewPath); await mkdir(previewPath);
    await assert.rejects(verifyBackupObjects(backup, backupPath), /NOT_A_FILE/);
    const empty = { files: [] } as unknown as ReturnType<typeof validateBackup>;
    assert.deepEqual(await verifyBackupObjects(empty, join(directory, "no-assets-needed.json")), { verified: 0 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
