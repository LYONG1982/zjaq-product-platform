import { ApiError } from "@zj/api-client";

export type UploadStage = "preparing" | "uploading" | "checking";
const stages: Record<UploadStage, string> = { preparing: "创建上传任务", uploading: "传输文件", checking: "检查文件" };
export class UploadFailure extends Error {
  constructor(public reason: string, public hint: string, public code: string, public stage: UploadStage, public requestId?: string) {
    super(`[${code}] ${reason}\n下一步：${hint}\n发生阶段：${stages[stage]}${requestId ? " · 请求编号 " + requestId : ""}`);
  }
}
export function uploadFailure(error: unknown, stage: UploadStage): UploadFailure {
  if (error instanceof UploadFailure) return error;
  let code = "UPLOAD_FAILED", reason = "上传未完成，请重试或联系管理员", requestId: string | undefined;
  if (error instanceof ApiError) { code = error.code; reason = error.message; requestId = error.requestId; }
  else if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) {
    code = "REQUEST_TIMEOUT"; reason = "请求已超时或中断，无法确认本次处理结果";
  } else if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    code = "NETWORK_ERROR"; reason = "无法连接上传服务，可能是网络中断或跨域配置异常";
  }
  let hint = "可重试；仍失败时复制问题详情交给管理员排查。";
  if (/VIDEO_(CODEC|AUDIO_CODEC|LIMIT|TRACKS)_UNSUPPORTED|VIDEO_CONTAINER_MISMATCH|VIDEO_CORRUPT|UNSUPPORTED_MEDIA_TYPE/.test(code))
    hint = "重新导出 MP4：H.264 视频、AAC 音频（也可无音轨），再选择文件上传。";
  if (code === "FILE_TOO_LARGE")
    hint = "文件须 ≤500 MiB；若未超限仍被拒绝，请管理员核对网关限额，不要仅修改扩展名。";
  if (/VIDEO_PROBE_(UNAVAILABLE|CONFIGURATION|INVALID_RESULT)|VIDEO_PROCESSING_FAILED|SERVER_UNAVAILABLE|INVALID_RESPONSE|STORAGE_FULL|FILE_CHECK_UNAVAILABLE/.test(code))
    hint = "请管理员检查视频检查工具、存储及网关配置；修复后重试，无需反复改视频格式。";
  if (/TIMEOUT|NETWORK_ERROR|UPLOAD_BUSY|RATE_LIMITED/.test(code))
    hint = "检查网络后稍候重试；系统会先核对已有任务状态，已接收的文件不会重复上传。";
  if (code === "UNAUTHORIZED") hint = "重新登录后再操作，保留原文件与当前编辑内容。";
  if (code === "FORBIDDEN") hint = "请联系管理员确认当前账号的上传权限。";
  return new UploadFailure(reason, hint, code, stage, requestId);
}
