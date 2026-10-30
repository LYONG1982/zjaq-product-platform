import { api } from "./api";
import type { Domain } from "@zj/contracts";
const attempts = new WeakMap<File, Map<string, string>>();
export type UploadProgress = {
  stage: "preparing" | "uploading" | "checking" | "ready";
  loaded: number;
  total: number | null;
};
export async function uploadFile(
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
  if (file.size > 500 * 1024 * 1024) throw new Error("单个文件不能超过 500 MiB（524,288,000 字节）");
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
  let current = (await api.uploadStatus(intent.uploadId)).data;
  if (current.status === "UPLOADING") {
    status("正在上传 " + file.name + "…");
    progress?.({ stage: "uploading", loaded: 0, total: file.size || null });
    try {
      current = (await api.putBytes(intent.uploadId, file, (sent, total) => {
        status("正在上传 " + file.name + (total > 0 ? " · " + Math.min(100, Math.round(sent / total * 100)) + "%（" + (sent / 1024 / 1024).toFixed(1) + " / " + (total / 1024 / 1024).toFixed(1) + " MiB）" : "…"));
        progress?.({ stage: "uploading", loaded: sent, total: total > 0 ? total : null });
      })).data;
    } catch (e) {
      current = (await api.uploadStatus(intent.uploadId)).data;
      if (current.status === "UPLOADING") throw e;
    }
  }
  if (current.status === "CHECKING") {
    status("正在检查文件字节与格式…");
    progress?.({ stage: "checking", loaded: file.size, total: file.size || null });
    current = (await api.completeUpload(intent.uploadId)).data;
  }
  if (current.status !== "READY")
    throw new Error(current.error || "文件未通过检查");
  status("检查完成，可用于本次草稿");
  progress?.({ stage: "ready", loaded: file.size, total: file.size || null });
  return current;
}
