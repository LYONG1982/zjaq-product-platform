import { api } from "./api";
import type { Domain } from "@zj/contracts";
const attempts = new WeakMap<File, Map<string, string>>();
export async function uploadFile(
  productId: string,
  file: File,
  purpose: Domain["UploadIntent"]["purpose"],
  status: (text: string) => void,
) {
  const types: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "",
    contentType = file.type || types[ext] || "application/octet-stream";
  let map = attempts.get(file);
  if (!map) {
    map = new Map();
    attempts.set(file, map);
  }
  const scope = productId + "/" + purpose;
  if (!map.has(scope)) map.set(scope, crypto.randomUUID());
  status("正在创建上传任务…");
  const intent = (
    await api.createUpload(
      { productId, purpose, fileName: file.name, contentType, size: file.size },
      map.get(scope)!,
    )
  ).data;
  let current = (await api.uploadStatus(intent.uploadId)).data;
  if (current.status === "UPLOADING") {
    status("正在上传 " + file.name + "…");
    try {
      current = (await api.putBytes(intent.uploadId, file)).data;
    } catch (e) {
      current = (await api.uploadStatus(intent.uploadId)).data;
      if (current.status === "UPLOADING") throw e;
    }
  }
  if (current.status === "CHECKING") {
    status("正在检查文件字节与格式…");
    current = (await api.completeUpload(intent.uploadId)).data;
  }
  if (current.status !== "READY")
    throw new Error(current.error || "文件未通过检查");
  status("检查完成，可用于本次草稿");
  return current;
}
