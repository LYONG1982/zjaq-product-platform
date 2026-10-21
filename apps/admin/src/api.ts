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
let accessToken: string | undefined = isLocalMock
  ? (import.meta.env.VITE_MOCK_TOKEN ?? "local-mock")
  : undefined;
const transport: Transport = async (...args) => {
  const result = await fetchTransport(...args);
  if (result.status === 401)
    window.dispatchEvent(new Event("zj-session-expired"));
  return result;
};
export const api = createClient(base, transport, () => accessToken);
export async function signIn(username: string, password: string) {
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
