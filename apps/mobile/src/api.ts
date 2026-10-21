import { createClient, type Transport } from "@zj/api-client";
const transport: Transport = (url, headers) =>
  new Promise((resolve, reject) => {
    uni.request({
      url,
      method: "GET",
      header: headers,
      timeout: 10000,
      success: (result) =>
        resolve({ status: result.statusCode, body: result.data }),
      fail: () => reject(new Error("暂时无法连接资料服务，请稍后重试")),
    });
  });
export const apiBase =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1";
export const resourceUrl = (path: string) =>
  apiBase.replace(/\/$/, "") + path.replace(/^\/api\/v1/, "");
export const api = createClient(apiBase, transport);
