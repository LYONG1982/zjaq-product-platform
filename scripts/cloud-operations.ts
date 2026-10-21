import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  CloudBaseRepository,
  collections,
} from "../services/api/src/repository";
import { validateBackup } from "../services/api/src/backup-validation";
import { initialize, seedOriginals } from "../services/api/src/initialize";
const action = process.argv[2] ?? "plan",
  apply = process.argv.includes("--apply");
const after = (flag: string) => process.argv[process.argv.indexOf(flag) + 1];
if (
  !["plan", "initialize", "seed-originals", "backup", "restore"].includes(
    action,
  )
)
  throw new Error("Unknown action");
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
    for (let skip = 0; skip < 10000; skip += 100) {
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
    records[name] = rows;
  }
  const end = await repo.get<{ revision: number }>("control", "state");
  if (state.revision !== end?.revision)
    throw new Error(
      "Concurrent writes detected; retry backup during a quiet period",
    );
  // Storage bytes form part of the same backup, including original private source files.
  const assets = records.assets as { assetId: string; fileId?: string }[];
  const fileRoot = resolve(path + ".assets");
  await mkdir(fileRoot, { recursive: true, mode: 0o700 });
  const files = [];
  for (const asset of assets) {
    if (!asset.fileId) continue;
    const dest = resolve(fileRoot, asset.assetId);
    await repo.app.downloadFile({ fileID: asset.fileId, tempFilePath: dest });
    const bytes = await readFile(dest);
    files.push({
      assetId: asset.assetId,
      fileId: asset.fileId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
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
  const map = new Map<string, string>();
  for (const f of backup.files) {
    if (!/^[a-f0-9-]{36}$/.test(f.assetId))
      throw new Error("Invalid backup asset identifier");
    const bytes = await readFile(resolve(path + ".assets", f.assetId));
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256)
      throw new Error("Backup checksum mismatch");
    const r = await repo.app.uploadFile({
      cloudPath: "private/restore/" + f.assetId,
      fileContent: bytes,
    });
    map.set(f.fileId, r.fileID);
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
