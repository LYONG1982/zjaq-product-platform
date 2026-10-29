import { siteImageMetadata } from "../../mock-api/src/site-image";
import type { Domain, Responses } from "@zj/contracts";
import { requireValue, validateBody } from "./errors";

export const emptySiteBanner = (): Responses["SiteBanner"] => ({ version: 0, imageData: null, link: null });
export function visibleSiteBanner(value: Responses["SiteBanner"], now = Date.now()): Responses["SiteBanner"] {
  const active = (!value.startsAt || Date.parse(value.startsAt) <= now) && (!value.endsAt || Date.parse(value.endsAt) > now);
  const { startsAt, endsAt, ...publicValue } = value;
  const next = [startsAt, endsAt].filter((time): time is string => !!time).map(Date.parse).filter(time => Number.isFinite(time) && time > now);
  const refreshAfterSeconds = Math.max(1, Math.min(30, next.length ? Math.ceil((Math.min(...next) - now) / 1000) : 30));
  return active ? { ...publicValue, refreshAfterSeconds } : { ...publicValue, imageData: null, link: null, refreshAfterSeconds };
}
export function bannerFields(value: Domain["SiteBannerWrite"]) {
  return { imageData: value.imageData, link: value.link, startsAt: value.startsAt ?? null, endsAt: value.endsAt ?? null, introduction: value.introduction?.trim() || null, introLink: value.introLink ?? null };
}
export function validateSiteLink(link: string) {
  const internal = /^\/pages\/(?:products|materials|home)\/index$/.test(link);
  let external = false;
  try { const url = new URL(link); external = url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !/[\u0000-\u0020]/.test(link); } catch { /* relative path */ }
  requireValue(internal || external, 422, "VALIDATION_FAILED", "跳转地址须为 HTTPS 链接或支持的小程序页面路径");
}
export async function validateSiteImage(imageData: string | null, limit: number, label: string) {
  if (!imageData) return;
  const match = imageData.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
  requireValue(match, 422, "VALIDATION_FAILED", `${label}仅支持 PNG 或 JPG 图片`);
  const bytes = Buffer.from(match[2], "base64");
  requireValue(bytes.length > 0 && bytes.length <= limit && bytes.toString("base64") === match[2], 422, "VALIDATION_FAILED", `${label}图片无效或超过大小限制`);
  try {
    const info = await siteImageMetadata(bytes);
    requireValue(info.format === (match[1] === "jpeg" ? "jpeg" : "png") && !!info.width && !!info.height, 422, "VALIDATION_FAILED", `${label}图片格式不匹配或损坏`);
  } catch { requireValue(false, 422, "VALIDATION_FAILED", `${label}图片无法读取或尺寸过大`); }
}
export async function validateSiteBanner(body: unknown): Promise<Domain["SiteBannerWrite"]> {
  const value = validateBody<Domain["SiteBannerWrite"]>("SiteBannerWrite", body);
  await validateSiteImage(value.imageData, 400 * 1024, "Banner");
  for (const key of ["link", "introLink"] as const) if (value[key]) { value[key] = value[key]!.trim(); validateSiteLink(value[key]!); }
  for (const key of ["startsAt", "endsAt"] as const) if (value[key]) {
    const date = value[key]!;
    requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date.slice(0,19) + "Z").toISOString().startsWith(date.slice(0,19)), 422, "VALIDATION_FAILED", "Banner 有效期必须是带时区的有效时间");
    value[key] = new Date(date).toISOString();
  }
  requireValue(!value.startsAt || !value.endsAt || Date.parse(value.startsAt) < Date.parse(value.endsAt), 422, "VALIDATION_FAILED", "Banner 结束时间必须晚于开始时间");
  requireValue(!value.introLink || !!value.introduction?.trim(), 422, "VALIDATION_FAILED", "配置介绍跳转时请填写介绍文字");
  return value;
}
