import { sameOrigin, salesIdentity, sealSession, sessionCookie } from "../../../../lib/sales-session";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const error = (status: number, message: string) => Response.json({ error: { message } }, { status, headers });
export async function POST(request: Request) {
  if (!sameOrigin(request, true)) return error(403, "请从本站登录");
  if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return error(415, "请求格式无效");
  let body: { accessToken?: unknown; localValidation?: unknown };
  try {
    const reader = request.body?.getReader(); if (!reader) return error(400, "身份凭证无效");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4096) { await reader.cancel(); return error(413, "身份凭证无效"); } chunks.push(part.value); }
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch { return error(400, "身份凭证无效"); }
  let token: string;
  if (body.localValidation === true && process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SALES_MOCK === "true") token = "local-sales";
  else if (typeof body.accessToken === "string" && body.accessToken && body.accessToken.length <= 2600 && !/\s/.test(body.accessToken) && !body.accessToken.startsWith("local-")) token = body.accessToken;
  else return error(401, "身份凭证无效");
  try {
    const identity = await salesIdentity(token);
    if (!identity.ok) return error(identity.status === 403 ? 403 : 401, "此账号无法进入销售工作台，请检查登录或联系管理员");
    if ((await identity.json()).data?.role !== "SALES") return error(403, "此账号没有销售工作台权限");
    return Response.json({ data: { authenticated: true } }, { headers: { ...headers, "Set-Cookie": sessionCookie(sealSession(token)) } });
  } catch { return error(503, "身份服务或销售会话尚不可用，请联系管理员"); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request, true)) return error(403, "请从本站退出登录");
  return Response.json({ data: { authenticated: false } }, { headers: { ...headers, "Set-Cookie": sessionCookie("", true), "Clear-Site-Data": '"cache"' } });
}
