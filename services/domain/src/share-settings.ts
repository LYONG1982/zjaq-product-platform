import type { Domain, Responses } from "@zj/contracts";
import { AppError, requireValue, validateBody } from "./errors";
export const emptyShareSettings = (): Responses["ShareSettings"] => ({ version: 0, baseUrl: null, target: "h5", size: 512 });
/** Deployment-owned exact origins prevent configuring arbitrary redirect targets. */
export function validateShareSettings(body: unknown, env: NodeJS.ProcessEnv = process.env): Domain["ShareSettingsWrite"] {
  const value = validateBody<Domain["ShareSettingsWrite"]>("ShareSettingsWrite", body);
  if (value.baseUrl !== null) {
    let url: URL;
    try { url = new URL(value.baseUrl); } catch { throw new AppError(422, "VALIDATION_FAILED", "请填写有效的 HTTPS 站点根地址"); }
    const allowed = (env.SHARE_ALLOWED_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean);
    requireValue(url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" && allowed.includes(url.origin), 422, "VALIDATION_FAILED", "分享目标须为部署配置 SHARE_ALLOWED_ORIGINS 中的本项目 HTTPS 站点根地址");
    value.baseUrl = url.origin;
  }
  return value;
}
