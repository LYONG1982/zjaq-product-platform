import { api } from "./api";
import type { Domain } from "@zj/contracts";
import { ApiError } from "@zj/api-client";
import { uploadFailure, type UploadStage } from "./upload-errors";
const attempts = new WeakMap<File, Map<string, string>>();
export type UploadProgress = {
  stage: "preparing" | "uploading" | "checking" | "ready";
  loaded: number;
  total: number | null;
};
async function transferUpload(
  productId: string,
  file: File,
  purpose: Domain["UploadIntent"]["purpose"],
  status: (text: string) => void,
  progress?: (value: UploadProgress) => void,
) {
  const types: Record<string, string> = {
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "",
    contentType = types[ext] || file.type || "application/octet-stream";
  if (purpose === "media" && file.size > 2_000_000) throw new ApiError(413, "IMAGE_TOO_LARGE", "产品介绍图片单张不能超过 2 MB（2,000,000 字节）");
  if (file.size > 500 * 1024 * 1024) throw new ApiError(413, "FILE_TOO_LARGE", "单个文件不能超过 500 MiB（524,288,000 字节）");
  let map = attempts.get(file);
  if (!map) {
    map = new Map();
    attempts.set(file, map);
  }
  const scope = productId + "/" + purpose;
  if (!map.has(scope)) map.set(scope, crypto.randomUUID());
  status("正在创建上传任务…");
  progress?.({ stage: "preparing", loaded: 0, total: file.size || null });
  const intent = (
    await api.createUpload(
      { productId, purpose, fileName: file.name, contentType, size: file.size },
      map.get(scope)!,
    )
  ).data;
  let response = await api.uploadStatus(intent.uploadId);
  let current = response.data;
  if (current.status === "UPLOADING") {
    status("正在上传 " + file.name + "…");
    progress?.({ stage: "uploading", loaded: 0, total: file.size || null });
    try {
      response = await api.putBytes(intent.uploadId, file, (sent, total) => {
        status("正在上传 " + file.name + (total > 0 ? " · " + Math.min(100, Math.round(sent / total * 100)) + "%（" + (sent / 1024 / 1024).toFixed(1) + " / " + (total / 1024 / 1024).toFixed(1) + " MiB）" : "…"));
        progress?.({ stage: "uploading", loaded: sent, total: total > 0 ? total : null });
      });
      current = response.data;
    } catch (e) {
      // A second network failure must not hide the original HTTP/upload cause.
      try { response = await api.uploadStatus(intent.uploadId); current = response.data; }
      catch { throw e; }
      if (current.status === "UPLOADING") throw e;
    }
  }
  if (current.status === "CHECKING") {
    status("正在检查文件字节与格式…");
    progress?.({ stage: "checking", loaded: file.size, total: file.size || null });
    response = await api.completeUpload(intent.uploadId);
    current = response.data;
  }
  if (current.status !== "READY") {
    // A terminal rejected upload must get a fresh intent on explicit retry.
    if (current.status === "REJECTED") map.delete(scope);
    const match = current.error?.match(/^\[([A-Z0-9_]+)\]\s*(.*)$/s);
    throw new ApiError(422, match?.[1] ?? "FILE_CHECK_FAILED", match?.[2] ?? current.error ?? "文件未通过检查", response.requestId);
  }
  status("检查完成，可用于本次草稿");
  progress?.({ stage: "ready", loaded: file.size, total: file.size || null });
  return current;
}

export async function uploadFile(
  productId: string,
  file: File,
  purpose: Domain["UploadIntent"]["purpose"],
  status: (text: string) => void,
  progress?: (value: UploadProgress) => void,
) {
  let stage: UploadStage = "preparing";
  try {
    return await transferUpload(productId, file, purpose, status, value => {
      if (value.stage !== "ready") stage = value.stage;
      progress?.(value);
    });
  } catch (error) { throw uploadFailure(error, stage); }
}
