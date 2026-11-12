import {
  createClient,
  ApiError,
  fetchTransport,
  type Transport,
} from "@zj/api-client";
import { randomId } from "./random-id";
const base =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1";
const logoutFlag = "zj-admin-signed-out";
const tokenKey = "zj-admin-token";
let authGeneration = 0;
let accessToken: string | undefined = sessionStorage.getItem(tokenKey) ?? undefined;
const transport: Transport = async (...args) => {
  const generation = authGeneration;
  const result = await fetchTransport(...args);
  if (generation !== authGeneration) throw new Error("当前会话已结束，请重新登录");
  if (result.status === 401) {
    accessToken = undefined;
    sessionStorage.removeItem(tokenKey);
    window.dispatchEvent(new Event("zj-session-expired"));
  }
  return result;
};
export const api = createClient(base, transport, () => accessToken);
export function signOut() {
  const token = accessToken;
  authGeneration += 1;
  accessToken = undefined;
  sessionStorage.setItem(logoutFlag, "1");
  sessionStorage.removeItem(tokenKey);
  if (token)
    void fetch(base + "/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
}
export const wasSignedOut = () => sessionStorage.getItem(logoutFlag) === "1";
export async function signIn(username: string, password: string) {
  const response = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const result = (await response.json().catch(() => null)) as
    | { data?: { accessToken?: unknown }; error?: { message?: string } }
    | null;
  const token = result?.data?.accessToken;
  if (!response.ok || typeof token !== "string")
    throw new Error(result?.error?.message ?? "登录未成功，请检查账号信息");
  accessToken = token;
  try {
    await api.me();
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.removeItem(logoutFlag);
  } catch (e) {
    accessToken = undefined;
    sessionStorage.removeItem(tokenKey);
    throw e;
  }
}
export const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export const stateName = (state: string) =>
  ({ DRAFT: "草稿", PUBLISHED: "已发布", OFFLINE: "已下架" })[state] ?? state;
export function requestKey() {
  let body = "",
    key = "";
  return (value: unknown) => {
    const next = JSON.stringify(value);
    if (!key || body !== next) {
      body = next;
      key = randomId();
    }
    return key;
  };
}
export function errorInfo(e: unknown) {
  return {
    message: e instanceof Error ? e.message : "操作失败，请重试",
    fields: e instanceof ApiError ? e.fields : [],
    conflict: e instanceof ApiError && e.status === 409,
  };
}
