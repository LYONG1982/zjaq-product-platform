import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const SESSION_SECONDS = 30 * 60;
export const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-zj-sales" : "zj-sales";
type Session = { token: string; expiresAt: number };
const development = globalThis as typeof globalThis & { zjSalesDevelopmentKey?: Buffer };
function key(): Buffer {
  const configured = process.env.PORTAL_SESSION_SECRET;
  if (configured && /^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
  if (process.env.NODE_ENV === "production") throw new Error("销售会话尚未配置，请联系管理员");
  if (configured) throw new Error("销售会话配置无效，请联系管理员");
  return development.zjSalesDevelopmentKey ??= randomBytes(32);
}
export function sealSession(token: string, now = Date.now()) {
  if (!token || token.length > 2600 || /\s/.test(token)) throw new Error("身份凭证无效");
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(cookieName()));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ token, expiresAt: now + SESSION_SECONDS * 1000 })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}
export function openSession(value: string | undefined, now = Date.now()): Session | null {
  if (!value || value.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 30) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(cookieName())); decipher.setAuthTag(bytes.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()) as Session;
    if (typeof session.token !== "string" || !session.token || session.token.length > 2600 || /\s/.test(session.token) || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= now || session.expiresAt > now + SESSION_SECONDS * 1000) return null;
    return session;
  } catch { return null; }
}
export function requestSession(request: Request) {
  const values = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(cookieName() + "="));
  return values.length === 1 ? openSession(values[0].slice(cookieName().length + 1)) : null;
}
export function sessionCookie(value: string, clear = false) {
  return `${cookieName()}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function sameOrigin(request: Request, requireOrigin = false) {
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return !requireOrigin;
  const requestUrl = new URL(request.url);
  // Next may normalize its internal URL to localhost. Host is the actual browser
  // authority; forwarded headers are deliberately not used as origin evidence.
  const expected = process.env.PORTAL_PUBLIC_ORIGIN || `${requestUrl.protocol}//${request.headers.get("host") ?? requestUrl.host}`;
  try { const parsed = new URL(expected); return parsed.origin === expected && origin === expected; } catch { return false; }
}
export const apiBase = () => (process.env.PORTAL_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1").replace(/\/$/, "");
export async function salesIdentity(token: string) {
  return fetch(apiBase() + "/sales/me", { headers: { Authorization: "Bearer " + token }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
}
/** Keep login returns on the known PC pages, including a direct viewer link. */
export function safeLoginReturn(value?: string) {
  if (!value || value.length > 2000 || /[\\\u0000-\u001f]/.test(value)) return "/";
  try {
    const parsed = new URL(value, "http://local.invalid");
    if (!value.startsWith("/") || parsed.origin !== "http://local.invalid" || !/^\/(?:products(?:\/[A-Za-z0-9_-]+)?|materials|viewer)?$/.test(parsed.pathname)) return "/";
    const allowed = new URLSearchParams();
    for (const key of ["q", "categoryId", "ownership", "updatedFrom", "updatedTo", "cursor", "productId", "materialId", "from"]) {
      const part = parsed.searchParams.get(key); if (part) allowed.set(key, part.slice(0, key === "from" ? 1000 : 512));
    }
    return parsed.pathname + (allowed.size ? "?" + allowed.toString() : "");
  } catch { return "/"; }
}
