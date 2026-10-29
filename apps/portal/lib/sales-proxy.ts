import { apiBase, requestSession, sameOrigin, sessionCookie } from "./sales-session";
/** Stream from the private API with the HttpOnly session. Never buffers file bodies. */
export async function proxySales(request: Request, path: string[], compatibilityCatalog = false) {
  const output = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "sandbox; default-src 'none'" });
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
  if (!sameOrigin(request) || path.some((part) => !part || part === "." || part === ".." || /[\\/?#\u0000-\u001f]/.test(part))) return new Response(null, { status: 403, headers: output });
  const session = requestSession(request);
  if (!session) return Response.json({ error: { code: "UNAUTHENTICATED", message: "请重新登录销售工作台" } }, { status: 401, headers: output });
  const suffix = (compatibilityCatalog ? "catalog/" : "") + path.map(encodeURIComponent).join("/");
  // Categories do not include private fields. The endpoint still requires a live sales role.
  const categories = suffix === "catalog/categories";
  if (categories) {
    const me = await fetch(apiBase() + "/sales/me", { headers: { Authorization: "Bearer " + session.token }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!me?.ok) return Response.json({ error: { message: me && [401, 403].includes(me.status) ? "请重新登录销售工作台" : "身份服务暂不可用，请稍后重试" } }, { status: me && [401, 403].includes(me.status) ? me.status : 503, headers: output });
  }
  const target = new URL(apiBase() + "/" + (categories ? suffix : "sales/" + suffix));
  target.search = new URL(request.url).search;
  const headers = new Headers({ Authorization: "Bearer " + session.token });
  if (request.headers.has("range")) headers.set("Range", request.headers.get("range")!);
  try {
    const response = await fetch(target, { cache: "no-store", headers, redirect: "error", signal: AbortSignal.any([request.signal, AbortSignal.timeout(15 * 60 * 1000)]) });
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition", "x-request-id"]) { const value = response.headers.get(key); if (value) output.set(key, value); }
    if (response.status === 401 || response.status === 403) output.set("Set-Cookie", sessionCookie("", true));
    return new Response(response.body, { status: response.status, headers: output });
  } catch { return Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "销售资料服务暂不可用" } }, { status: 503, headers: output }); }
}
