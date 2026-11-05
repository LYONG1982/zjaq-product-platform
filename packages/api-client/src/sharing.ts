/// <reference path="./qrcode.d.ts" />
import type { Responses } from "@zj/contracts";
export function shareLink(settings: Responses["ShareSettings"], productId: string, materialId?: string, technical = false) {
  if (!settings.baseUrl) throw new Error("尚未配置分享地址，请联系管理员在系统设置中配置");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) throw new Error("产品尚无可分享的公开标识");
  const base = new URL(settings.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("分享站点配置无效");
  if (technical && settings.target !== "portal") throw new Error("技术资料需要销售身份，请将分享目标配置为销售 PC 网页");
  return settings.target === "h5"
    ? base.origin + (materialId ? "/#/pages/viewer/index?productId=" + productId + "&materialId=" + encodeURIComponent(materialId) : "/#/pages/detail/index?id=" + productId)
    : base.origin + (materialId ? "/viewer?productId=" + productId + "&materialId=" + encodeURIComponent(materialId) : "/products/" + productId);
}
export async function shareQr(url: string, size: 256 | 512 | 1024) {
  // Render locally: no third-party QR service receives the share target.
  const QRCode = await import("qrcode");
  // qrcode 1.5.4 floors a divide/multiply result; compensate floating-point underflow.
  return QRCode.toDataURL(url, { width: size + Number.EPSILON * size, margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000ff", light: "#ffffffff" } });
}
