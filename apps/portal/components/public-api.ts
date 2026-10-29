import { createClient, type Transport } from "@zj/api-client";
import { requireSales } from "../lib/require-sales";
import { apiBase } from "../lib/sales-session";
/** PC reads all go through the sales role, including server-rendered catalogue pages. */
export async function api(returnTo = "/") {
  const token = await requireSales(returnTo);
  const transport: Transport = async (url, headers, request) => {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith("/catalog/categories")) parsed.pathname = parsed.pathname.replace(/\/catalog\//, "/sales/catalog/");
    const response = await fetch(parsed, { headers, method: request?.method ?? "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    return { status: response.status, body: await response.json() };
  };
  return createClient(apiBase(), transport, token);
}
export const mediaUrl = (path: string) => path.startsWith("/api/v1/sales/")
  ? "/api/sales/" + path.slice("/api/v1/sales/".length)
  : "/api/catalog/" + path.replace(/^\/api\/v1\/catalog\//, "");
export const viewerUrl = (productId: string, materialId: string) => "/viewer?productId=" + encodeURIComponent(productId) + "&materialId=" + encodeURIComponent(materialId);
