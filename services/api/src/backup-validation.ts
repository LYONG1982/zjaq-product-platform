import { collections } from "./repository";
export function validateBackup(value: unknown) {
  const b = value as {
    format: number;
    environment: string;
    revision: number;
    records: Record<string, Record<string, unknown>[]>;
    files: { assetId: string; fileId: string; sha256: string }[];
  };
  if (
    !b ||
    b.format !== 1 ||
    typeof b.environment !== "string" ||
    !Number.isSafeInteger(b.revision) ||
    b.revision < 1 ||
    !Array.isArray(b.files) ||
    !b.records
  )
    throw new Error("INVALID_BACKUP");
  const expected = collections.filter((c) => c !== "rates");
  if (
    Object.keys(b.records).length !== expected.length ||
    expected.some((k) => !Array.isArray(b.records[k]))
  )
    throw new Error("INCOMPLETE_BACKUP");
  for (const [collection, items] of Object.entries(b.records)) {
    const ids = new Set();
    for (const item of items) {
      if (typeof item._id !== "string" || !item._id || ids.has(item._id))
        throw new Error("INVALID_DOCUMENT_ID");
      ids.add(item._id);
    }
    if (
      collection === "control" &&
      !["state", "catalog", "counter", "admins"].every((id) => ids.has(id))
    )
      throw new Error("MISSING_CONTROL_RECORD");
  }
  const fileIds = new Set();
  for (const f of b.files) {
    if (
      !/^[a-f0-9-]{36}$/.test(f.assetId) ||
      typeof f.fileId !== "string" ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      fileIds.has(f.fileId)
    )
      throw new Error("INVALID_FILE_MANIFEST");
    fileIds.add(f.fileId);
  }
  for (const a of b.records.assets) {
    if (a.fileId && !fileIds.has(a.fileId))
      throw new Error("MISSING_PRIVATE_OBJECT");
    if (a.status === "READY") {
      const f = b.files.find((f) => f.fileId === a.fileId);
      if (!f || a.checksum !== f.sha256)
        throw new Error("READY_OBJECT_CHECKSUM_MISMATCH");
    }
  }
  const drafts = new Set(b.records.drafts.map((d) => d._id)),
    releases = new Set(b.records.releases.map((d) => d._id));
  for (const p of b.records.products) {
    if (!drafts.has(p._id)) throw new Error("MISSING_DRAFT");
    for (const id of [p.activeReleaseId, p.lastReleaseId])
      if (id && !releases.has(id)) throw new Error("MISSING_RELEASE");
  }
  if (!b.records.users.some((u) => u.role === "ADMIN" && u.enabled === true))
    throw new Error("MISSING_ADMIN");
  return b;
}
