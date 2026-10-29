import type { Domain, Responses } from "@zj/contracts";
import { requireValue, validateBody } from "./errors";
import { validateSiteImage } from "./site-banner";
// Initial number is supplied by the requirements attachment; business review
// remains necessary before production publication.
export const emptySiteContact = (): Responses["SiteContact"] => ({ version: 0, officialQr: null, serviceQr: null, phone: "400-685-0800" });
export async function validateSiteContact(body: unknown): Promise<Domain["SiteContactWrite"]> {
  const value = validateBody<Domain["SiteContactWrite"]>("SiteContactWrite", body);
  await validateSiteImage(value.officialQr, 240 * 1024, "公众号二维码");
  await validateSiteImage(value.serviceQr, 240 * 1024, "客服二维码");
  if (value.phone) {
    value.phone = value.phone.trim();
    requireValue(/^[+0-9 ()-]{3,32}$/.test(value.phone) && /\d{3}/.test(value.phone), 422, "VALIDATION_FAILED", "请填写有效的官方电话号码");
  }
  return value;
}
