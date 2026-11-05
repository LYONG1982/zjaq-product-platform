import {
  createClient,
  ApiError,
  fetchTransport,
  type Transport,
} from "@zj/api-client";
const base =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1";
export const isLocalMock = ["127.0.0.1", "localhost"].includes(
  new URL(base).hostname,
);
const logoutFlag = "zj-admin-signed-out";
let authGeneration = 0;
let accessToken: string | undefined = isLocalMock && sessionStorage.getItem(logoutFlag) !== "1"
  ? (import.meta.env.VITE_MOCK_TOKEN ?? "local-mock")
  : undefined;
const transport: Transport = async (...args) => {
  const generation = authGeneration;
  const result = await fetchTransport(...args);
  if (generation !== authGeneration) throw new Error("当前会话已结束，请重新登录");
  if (result.status === 401)
    window.dispatchEvent(new Event("zj-session-expired"));
  return result;
};
export const api = createClient(base, transport, () => accessToken);
export function signOut() {
  authGeneration += 1;
  accessToken = undefined;
  sessionStorage.setItem(logoutFlag, "1");
  void fetch(base + "/admin/logout", { method: "POST", credentials: "include", signal: AbortSignal.timeout(10000) }).catch(() => {});
}
export const wasSignedOut = () => sessionStorage.getItem(logoutFlag) === "1";
export async function signIn(username: string, password: string) {
  if (isLocalMock) accessToken = import.meta.env.VITE_MOCK_TOKEN ?? "local-mock";
  if (!isLocalMock) {
    const env = import.meta.env.VITE_CLOUDBASE_ENV_ID,
      origin = import.meta.env.VITE_CLOUDBASE_AUTH_ORIGIN;
    const expected = "https://" + env + ".api.tcloudbasegateway.com";
    if (!env || origin !== expected) throw new Error("身份服务尚未配置");
    const response = await fetch(origin + "/auth/v1/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || typeof result.access_token !== "string")
      throw new Error("登录未成功，请检查账号信息");
    accessToken = result.access_token;
  }
  try {
    await api.me();
    sessionStorage.removeItem(logoutFlag);
  } catch (e) {
    if (!isLocalMock) accessToken = undefined;
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
      key = crypto.randomUUID();
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
