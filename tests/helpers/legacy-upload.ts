import type { Domain } from "@zj/contracts";
import { AssetStore } from "../../services/mock-api/src/assets";
/** Test-only import of an old stored upload. No HTTP or production admission bypass. */
export function legacyUpload(store: AssetStore, intent: Domain["UploadIntent"]) {
  const created = store.create({ ...intent, fileName: "historical.pdf", contentType: "application/pdf", purpose: "preview" });
  const upload = store.get(created.uploadId);
  upload.purpose = intent.purpose;
  upload.declaredMime = intent.contentType;
  const extension = intent.fileName.split(".").pop()!;
  upload.type = extension === "jpg" ? "jpeg" : extension;
  upload.fileExtension = extension;
  return created;
}
