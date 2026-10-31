import { siteImageMetadata } from "../../mock-api/src/site-image";
import type { Domain, Responses } from "@zj/contracts";
import { requireValue, validateBody } from "./errors";

export const DEFAULT_SITE_BANNER_PATH = "/api/v1/catalog/site-banner/default-image";
export const SITE_BANNER_CUSTOM_LIMIT = 5;
export const SITE_BANNER_IMAGE_LIMIT = 400 * 1024;
const defaultItem = (): Responses["SiteBannerItem"] => ({
  id: "default", isDefault: true, imagePath: DEFAULT_SITE_BANNER_PATH,
  imageData: null, link: null, startsAt: null, endsAt: null,
});
export const emptySiteBanner = (): Responses["SiteBanner"] => ({
  version: 0, items: [defaultItem()], imageData: null, link: null,
  startsAt: null, endsAt: null, introduction: null, introLink: null,
});

/** Upgrade stored single-image documents on read without writing or replacing any existing custom items. */
export function normalizeSiteBanner(value: Partial<Responses["SiteBanner"]> & Record<string, unknown>): Responses["SiteBanner"] {
  const storedItems = Array.isArray(value.items) ? value.items as Responses["SiteBannerItem"][] : undefined;
  let custom = storedItems?.filter(item => item?.id !== "default" && !item?.isDefault) ?? [];
  if ((!storedItems || custom.length === 0) && value.imageData) custom = [{
    id: "legacy", isDefault: false, imagePath: null,
    imageData: value.imageData as string, link: (value.link as string | null) ?? null,
    startsAt: (value.startsAt as string | null) ?? null, endsAt: (value.endsAt as string | null) ?? null,
  }];
  return {
    version: Number.isSafeInteger(value.version) && Number(value.version) >= 0 ? Number(value.version) : 0,
    items: [defaultItem(), ...custom],
    imageData: custom[0]?.imageData ?? null, link: custom[0]?.link ?? null,
    startsAt: custom[0]?.startsAt ?? null, endsAt: custom[0]?.endsAt ?? null,
    introduction: typeof value.introduction === "string" ? value.introduction : null,
    introLink: typeof value.introLink === "string" ? value.introLink : null,
  };
}
function active(item: Responses["SiteBannerItem"], now: number) {
  return (!item.startsAt || Date.parse(item.startsAt) <= now) && (!item.endsAt || Date.parse(item.endsAt) > now);
}
export function visibleSiteBanner(value: Responses["SiteBanner"], now = Date.now()): Responses["SiteBanner"] {
  const normalized = normalizeSiteBanner(value as Responses["SiteBanner"] & Record<string, unknown>);
  const custom = normalized.items.slice(1).filter(item => active(item, now));
  const next = normalized.items.slice(1).flatMap(item => [item.startsAt, item.endsAt])
    .filter((time): time is string => !!time).map(Date.parse).filter(time => Number.isFinite(time) && time > now);
  const refreshAfterSeconds = Math.max(1, Math.min(30, next.length ? Math.ceil((Math.min(...next) - now) / 1000) : 30));
  return { ...normalized, items: [defaultItem(), ...custom], imageData: custom[0]?.imageData ?? null,
    link: custom[0]?.link ?? null, startsAt: custom[0]?.startsAt ?? null, endsAt: custom[0]?.endsAt ?? null, refreshAfterSeconds };
}
export function bannerFields(value: Domain["SiteBannerWrite"], previous?: Responses["SiteBanner"]): Omit<Responses["SiteBanner"], "version" | "refreshAfterSeconds"> {
  const current = previous ? normalizeSiteBanner(previous as Responses["SiteBanner"] & Record<string, unknown>) : emptySiteBanner();
  let custom: Responses["SiteBannerItem"][];
  if (value.items) {
    custom = value.items.filter(item => item.id !== "default").map(item => ({ ...item, isDefault: false, imagePath: null }));
  } else {
    // Legacy PUTs mutate only their compatibility custom item; the protected default and other custom items survive.
    custom = current.items.slice(1).filter(item => item.id !== "legacy");
    if (value.imageData) custom.unshift({ id: "legacy", isDefault: false, imagePath: null,
      imageData: value.imageData, link: value.link ?? null, startsAt: value.startsAt ?? null, endsAt: value.endsAt ?? null });
  }
  requireValue(custom.length <= SITE_BANNER_CUSTOM_LIMIT, 422, "VALIDATION_FAILED", "Banner 自定义页最多配置 5 张；旧版单图更新不会覆盖现有页面");
  return { items: [defaultItem(), ...custom], imageData: custom[0]?.imageData ?? null,
    link: custom[0]?.link ?? null, startsAt: custom[0]?.startsAt ?? null, endsAt: custom[0]?.endsAt ?? null,
    introduction: value.introduction === undefined ? current.introduction ?? null : value.introduction?.trim() || null,
    introLink: value.introLink === undefined ? current.introLink ?? null : value.introLink ?? null };
}
export function validateSiteLink(link: string) {
  const internal = /^\/pages\/(?:products|materials|home)\/index$/.test(link);
  let external = false;
  try { const url = new URL(link); external = url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !/[\u0000-\u0020]/.test(link); } catch { /* relative path */ }
  requireValue(internal || external, 422, "VALIDATION_FAILED", "跳转地址须为 HTTPS 链接或支持的小程序页面路径");
}
export async function validateSiteImage(imageData: string | null, limit = SITE_BANNER_IMAGE_LIMIT, label = "Banner") {
  if (!imageData) return;
  const match = imageData.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
  requireValue(match, 422, "VALIDATION_FAILED", `${label}仅支持 PNG 或 JPG 图片`);
  const bytes = Buffer.from(match[2], "base64");
  requireValue(bytes.length > 0 && bytes.length <= limit && bytes.toString("base64") === match[2], 422, "VALIDATION_FAILED", `${label}图片无效或超过 400 KiB 限制`);
  try { const info = await siteImageMetadata(bytes); requireValue(info.format === (match[1] === "jpeg" ? "jpeg" : "png") && !!info.width && !!info.height, 422, "VALIDATION_FAILED", `${label}图片格式不匹配或损坏`); }
  catch { requireValue(false, 422, "VALIDATION_FAILED", `${label}图片无法读取或尺寸过大`); }
}
function canonicalDate(date: string, label: string) {
  requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date.slice(0,19) + "Z").toISOString().startsWith(date.slice(0,19)), 422, "VALIDATION_FAILED", `${label}有效期必须是带时区的有效时间`);
  return new Date(date).toISOString();
}
export async function validateSiteBanner(body: unknown): Promise<Domain["SiteBannerWrite"]> {
  const value = validateBody<Domain["SiteBannerWrite"]>("SiteBannerWrite", body);
  requireValue(value.items !== undefined || (Object.hasOwn(value, "imageData") && Object.hasOwn(value, "link")), 422, "VALIDATION_FAILED", "请提交 Banner 自定义页列表");
  if (value.items) {
    requireValue(value.items.length >= 1 && value.items.length <= SITE_BANNER_CUSTOM_LIMIT + 1, 422, "VALIDATION_FAILED", "Banner 自定义页最多配置 5 张");
    const defaults = value.items.filter(item => item.id === "default");
    requireValue(defaults.length === 1, 422, "VALIDATION_FAILED", "默认首张 Banner 必须保留");
    const item = defaults[0];
    requireValue(item.imageData === null && item.link === null && item.startsAt === null && item.endsAt === null && value.items[0] === item,
      422, "VALIDATION_FAILED", "默认首张 Banner 不可修改或移位");
    const custom = value.items.filter(item => item.id !== "default");
    requireValue(custom.length <= SITE_BANNER_CUSTOM_LIMIT && new Set(custom.map(item => item.id)).size === custom.length && custom.every(item => /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(item.id)), 422, "VALIDATION_FAILED", "Banner 条目 ID 格式无效或重复");
    for (const item of custom) {
      await validateSiteImage(item.imageData, SITE_BANNER_IMAGE_LIMIT, "Banner");
      if (item.imageData === null) requireValue(false, 422, "VALIDATION_FAILED", "自定义 Banner 必须保留图片");
      if (item.link) { item.link = item.link.trim(); validateSiteLink(item.link); }
      for (const key of ["startsAt", "endsAt"] as const) if (item[key]) item[key] = canonicalDate(item[key]!, "Banner");
      requireValue(!item.startsAt || !item.endsAt || Date.parse(item.startsAt) < Date.parse(item.endsAt), 422, "VALIDATION_FAILED", "Banner 结束时间必须晚于开始时间");
    }
  } else {
    await validateSiteImage(value.imageData ?? null, SITE_BANNER_IMAGE_LIMIT, "Banner");
    if (value.link) { value.link = value.link.trim(); validateSiteLink(value.link); }
    for (const key of ["startsAt", "endsAt"] as const) if (value[key]) value[key] = canonicalDate(value[key]!, "Banner");
    requireValue(!value.startsAt || !value.endsAt || Date.parse(value.startsAt) < Date.parse(value.endsAt), 422, "VALIDATION_FAILED", "Banner 结束时间必须晚于开始时间");
  }
  if (value.introLink) { value.introLink = value.introLink.trim(); validateSiteLink(value.introLink); }
  requireValue(!value.introLink || !!value.introduction?.trim(), 422, "VALIDATION_FAILED", "配置介绍跳转时请填写介绍文字");
  return value;
}
