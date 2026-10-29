import { restoreAnalyticsRecord } from "../../domain/src/analytics";
import { collections } from "./repository";
import { isPublicProductId } from "../../domain/src/public-id";
export function validateBackup(value: unknown) {
  const b = structuredClone(value) as {
    format: number;
    environment: string;
    revision: number;
    records: Record<string, Record<string, unknown>[]>;
    files: { assetId: string; fileId: string; sha256: string; variant?: "preview" }[];
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
  // Format 1 backups created before feedback existed have no such collection.
  // Preserve their recoverability while still rejecting all other missing sets.
  if (b.format === 1 && b.records && !Object.hasOwn(b.records, "feedback")) b.records.feedback = [];
  if (b.format === 1 && b.records && !Object.hasOwn(b.records, "analytics")) b.records.analytics = [];
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
  for (const event of b.records.analytics) restoreAnalyticsRecord(event);
  const fileIds = new Set(), variants = new Set();
  for (const f of b.files) {
    if (
      !/^[a-f0-9-]{36}$/.test(f.assetId) ||
      typeof f.fileId !== "string" ||
      !/^[a-f0-9]{64}$/.test(f.sha256) ||
      fileIds.has(f.fileId) ||
      (f.variant !== undefined && f.variant !== "preview") ||
      variants.has(f.assetId + ":" + (f.variant ?? "original"))
    )
      throw new Error("INVALID_FILE_MANIFEST");
    fileIds.add(f.fileId);
    variants.add(f.assetId + ":" + (f.variant ?? "original"));
  }
  for (const a of b.records.assets) {
    if (a.fileId && !b.files.some(f => f.fileId === a.fileId && f.assetId === a.assetId && !f.variant))
      throw new Error("MISSING_PRIVATE_OBJECT");
    if (a.previewFileId) {
      const preview = a.preview as { checksum?: unknown } | undefined;
      const f = b.files.find(f => f.fileId === a.previewFileId && f.assetId === a.assetId && f.variant === "preview");
      if (!f || f.sha256 !== preview?.checksum) throw new Error("PREVIEW_OBJECT_CHECKSUM_MISMATCH");
    } else if (a.preview) throw new Error("MISSING_PREVIEW_OBJECT");
    if (a.status === "READY") {
      const f = b.files.find((f) => f.fileId === a.fileId);
      if (!f || a.checksum !== f.sha256)
        throw new Error("READY_OBJECT_CHECKSUM_MISMATCH");
    }
  }
  const drafts = new Set(b.records.drafts.map((d) => d._id)),
    releases = new Set(b.records.releases.map((d) => d._id));
  const publicIds = new Set<string>();
  for (const p of b.records.products) {
    if (typeof p.productId !== "string" || p.productId !== p._id) throw new Error("PRODUCT_DOCUMENT_ID_MISMATCH");
    if (p.deletedAt != null) {
      if (typeof p.deletedAt !== "string" || !Number.isFinite(Date.parse(p.deletedAt)) || typeof p.deletedBy !== "string" || !p.deletedBy || typeof p.deletionReason !== "string" || !p.deletionReason.trim() || p.publicationState === "PUBLISHED" || p.activeReleaseId) throw new Error("INVALID_PRODUCT_REMOVAL_STATE");
    }
    if (p.publicId != null) {
      if (!isPublicProductId(p.publicId) || publicIds.has(p.publicId.toLowerCase())) throw new Error("INVALID_OR_DUPLICATE_PUBLIC_ID");
      publicIds.add(p.publicId.toLowerCase());
      const mapping = b.records.control.find(item => item._id === "public-" + String(p.publicId).toLowerCase());
      if (mapping && mapping.productId !== p.productId) throw new Error("PUBLIC_ID_INDEX_CONFLICT");
    }
    if (!drafts.has(p._id)) throw new Error("MISSING_DRAFT");
    for (const id of [p.activeReleaseId, p.lastReleaseId])
      if (id && (!releases.has(id) || b.records.releases.find(item => item._id === id)?.productId !== p.productId)) throw new Error("MISSING_OR_MISMATCHED_RELEASE");
  }
  for (const mapping of b.records.control.filter(item => typeof item._id === "string" && item._id.startsWith("public-"))) {
    const product = b.records.products.find(item => item.productId === mapping.productId);
    if (!product || "public-" + String(product.publicId).toLowerCase() !== mapping._id) throw new Error("ORPHAN_PUBLIC_ID_INDEX");
  }
  if (!b.records.users.some((u) => u.role === "ADMIN" && u.enabled === true))
    throw new Error("MISSING_ADMIN");
  return b;
}
