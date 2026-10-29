import { restoreAnalyticsRecord } from "../services/domain/src/analytics";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
async function fileHash(path: string) { const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest("hex"); }
import { resolve } from "node:path";
import {
  CloudBaseRepository,
  collections,
} from "../services/api/src/repository";
import { validateBackup } from "../services/api/src/backup-validation";
import { verifyBackupObjects } from "../services/api/src/backup-objects";
import { parseCloudOperationArguments } from "../services/api/src/operations-arguments";
import { initialize, seedOriginals } from "../services/api/src/initialize";
import { applyPublicIdMigration, type PublicIdMigration } from "../services/api/src/public-id-migration";
import { randomUUID } from "node:crypto";
import { CloudBasePrivateStorage } from "../services/api/src/private-storage";
const options = parseCloudOperationArguments(process.argv.slice(2)),
  action = options.action, apply = options.apply, after = options.value;
if (!apply) {
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        action,
        collections,
        originalProducts: 27,
        defaultState: "DRAFT",
        cloudConnected: false,
        requirements: [
          "approved exact environment",
          "private storage policy",
          "trusted admin subject",
          "empty restore target",
        ],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const target = after("--environment");
if (
  !process.argv.includes("--environment") ||
  !target ||
  target !== process.env.CLOUDBASE_ENV_ID
)
  throw new Error("Explicit environment must match CLOUDBASE_ENV_ID");
const repo = new CloudBaseRepository(
  target,
  process.env.CLOUDBASE_COLLECTION_PREFIX ?? "zj_",
);
const privateStorage = new CloudBasePrivateStorage(repo.app);
if (action === "initialize") {
  if (process.argv.includes("--create-collections"))
    for (const name of collections)
      await repo.db.createCollection(repo.prefix + name);
  console.log(
    JSON.stringify(
      await initialize(repo, process.env.ADMIN_BOOTSTRAP_SUBJECT_ID ?? ""),
    ),
  );
} else if (action === "seed-originals") {
  console.log(JSON.stringify(await seedOriginals(repo)));
} else if (action === "migrate-public-ids") {
  const planPath = after("--file"), backupPath = after("--backup");
  if (!process.argv.includes("--file") || !process.argv.includes("--backup")) throw new Error("Migration requires private backup and reviewed plan files");
  const backup = validateBackup(JSON.parse(await readFile(backupPath, "utf8")));
  const plan = JSON.parse(await readFile(planPath, "utf8")) as PublicIdMigration;
  if (backup.environment !== target || backup.revision !== plan.revision) throw new Error("Backup environment/revision mismatch");
  await verifyBackupObjects(backup, backupPath);
  const lease = randomUUID();
  await repo.transaction(async tx => {
    const state = await tx.get<{ ready: boolean; maintenance?: boolean; revision: number }>("control", "state");
    if (!state?.ready || state.maintenance || state.revision !== plan.revision) throw new Error("Target changed or already under maintenance");
    await tx.set("control", "state", { ...state, maintenance: true, maintenanceOwner: lease });
  });
  try { console.log(JSON.stringify(await applyPublicIdMigration(repo, plan))); }
  finally {
    await repo.transaction(async tx => {
      const state = await tx.get<{ maintenanceOwner?: string }>("control", "state");
      if (state?.maintenanceOwner !== lease) throw new Error("Maintenance owner changed; manual inspection required");
      const { maintenanceOwner, ...rest } = state;
      await tx.set("control", "state", { ...rest, maintenance: false });
    });
  }
} else if (action === "backup") {
  const path = after("--file");
  if (!process.argv.includes("--file"))
    throw new Error("Explicit private backup file required");
  // Exact document IDs are required. Read via SDK because Repository.list intentionally strips _id.
  const state = await repo.get<{ revision: number; ready: boolean }>(
    "control",
    "state",
  );
  if (!state?.ready) throw new Error("Environment not ready");
  const records: Record<string, unknown[]> = {};
  for (const name of collections.filter((c) => c !== "rates")) {
    const rows = [];
    if (name === "analytics") {
      let cursor = "";
      for (;;) {
        const query = repo.db.collection(repo.prefix + name);
        const r = await (cursor ? query.where({ _id: repo.db.command.gt(cursor) }) : query).orderBy("_id", "asc").limit(100).get();
        rows.push(...r.data);
        if (r.data.length < 100) break;
        cursor = String(r.data[r.data.length - 1]._id);
      }
    } else for (let skip = 0; skip < 10000; skip += 100) {
      const r = await repo.db
        .collection(repo.prefix + name)
        .orderBy("_id", "asc")
        .skip(skip)
        .limit(100)
        .get();
      rows.push(...r.data);
      if (r.data.length < 100) break;
      if (skip === 9900) throw new Error("Backup paging limit exceeded");
    }
    // Private backups must not reintroduce already expired IP history.
    records[name] = name === "analytics" ? rows.filter((row) => restoreAnalyticsRecord(row as Record<string, unknown>) !== undefined) : rows;
  }
  const end = await repo.get<{ revision: number }>("control", "state");
  if (state.revision !== end?.revision)
    throw new Error(
      "Concurrent writes detected; retry backup during a quiet period",
    );
  // Storage bytes form part of the same backup, including original private source files.
  const assets = records.assets as { assetId: string; fileId?: string; previewFileId?: string }[];
  const fileRoot = resolve(path + ".assets");
  await mkdir(fileRoot, { recursive: true, mode: 0o700 });
  const files = [];
  for (const asset of assets) {
    for (const [variant, fileId] of [["original", asset.fileId], ["preview", asset.previewFileId]] as const) {
      if (!fileId) continue;
      const dest = resolve(fileRoot, asset.assetId + (variant === "preview" ? ".preview" : ""));
      await privateStorage.download(fileId,dest);
      files.push({ assetId: asset.assetId, fileId, sha256: await fileHash(dest), ...(variant === "preview" ? { variant: "preview" as const } : {}) });
    }
  }
  const final = await repo.get<{ revision: number }>("control", "state");
  if (state.revision !== final?.revision)
    throw new Error("Concurrent writes during object backup; retry");
  await writeFile(
    path,
    JSON.stringify(
      {
        format: 1,
        environment: target,
        revision: state.revision,
        records,
        files,
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    JSON.stringify({
      saved: true,
      collections: Object.keys(records).length,
      files: files.length,
    }),
  );
} else if (action === "restore") {
  const path = after("--file");
  if (!process.argv.includes("--file")) throw new Error("Backup file required");
  const backup = validateBackup(JSON.parse(await readFile(path, "utf8")));
  if (
    !process.argv.includes("--isolated-target") ||
    target === backup.environment
  )
    throw new Error("Restore requires a different explicitly isolated target");
  for (const name of collections)
    if ((await repo.list(name)).length)
      throw new Error("Restore target must be empty");
  await verifyBackupObjects(backup, path);
  const map = new Map<string, string>();
  for (const f of backup.files) {
    if (!/^[a-f0-9-]{36}$/.test(f.assetId))
      throw new Error("Invalid backup asset identifier");
    const objectPath = resolve(path + ".assets", f.assetId + (f.variant === "preview" ? ".preview" : ""));
    if (await fileHash(objectPath) !== f.sha256)
      throw new Error("Backup checksum mismatch");
    const fileId = await privateStorage.upload("private/restore/" + f.assetId + (f.variant === "preview" ? ".preview" : ""),objectPath);
    map.set(f.fileId, fileId);
  }
  await repo.set("control", "state", {
    ready: false,
    maintenance: true,
    revision: 0,
  });
  for (const [name, items] of Object.entries(backup.records) as [
    string,
    Record<string, unknown>[],
  ][]) {
    if (!(collections as readonly string[]).includes(name))
      throw new Error("Unknown backup collection");
    for (const item of items) {
      const { _id, ...record } = item;
      if (typeof _id !== "string") throw new Error("Missing document ID");
      if (name === "control" && _id === "state") continue;
      if (name === "assets" && typeof record.fileId === "string") {
        const mapped = map.get(record.fileId);
        if (!mapped) throw new Error("Missing restored object");
        record.fileId = mapped;
      }
      if (name === "assets" && typeof record.previewFileId === "string") {
        const mapped = map.get(record.previewFileId); if (!mapped) throw new Error("Missing restored preview object"); record.previewFileId = mapped;
      }
      if (name === "analytics") {
        const restored = restoreAnalyticsRecord(record);
        if (!restored) continue;
        await repo.set(name, _id, restored);
        continue;
      }
      await repo.set(name, _id, record);
    }
  }
  await repo.set("control", "state", {
    ready: true,
    maintenance: false,
    revision: backup.revision + 1,
  });
  console.log(
    JSON.stringify({ restored: true, isolated: true, files: map.size }),
  );
} else throw new Error("Plan does not accept --apply");
