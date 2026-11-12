import { createClient, type Transport } from "@zj/api-client";
const transport: Transport = (url, headers, request) =>
  new Promise((resolve, reject) => {
    const method = request?.method ?? "GET";
    if (method !== "GET" && method !== "POST") { reject(new Error("当前客户端不支持此请求")); return; }
    uni.request({
      url,
      method,
      data: request?.body,
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
const downloadedImages = new Map<string, string>();
/** 小程序 <image> 不支持 http 远程图；先 downloadFile 成本地临时文件再展示，H5 原样返回。 */
export async function imageSource(path: string): Promise<string> {
  // #ifdef MP-WEIXIN
  if (/^http:\/\//i.test(path)) {
    const cached = downloadedImages.get(path);
    if (cached) return cached;
    const local = await new Promise<string>((resolve, reject) =>
      uni.downloadFile({
        url: path,
        timeout: 20000,
        success: (result) =>
          result.statusCode === 200
            ? resolve(result.tempFilePath)
            : reject(new Error("图片下载失败")),
        fail: () => reject(new Error("图片下载失败")),
      }),
    );
    downloadedImages.set(path, local);
    return local;
  }
  // #endif
  return path;
}
export const api = createClient(apiBase, transport);
