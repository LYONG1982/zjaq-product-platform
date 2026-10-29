import type {
  ListResponse,
  ObjectResponse,
  Responses,
  AdminDraft,
  AdminProductRow,
  Category,
  Template,
  Domain,
} from "@zj/contracts";
export type Transport = (
  url: string,
  headers: Record<string, string>,
  request?: { method: string; body?: string },
) => Promise<{ status: number; body: unknown }>;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public fields: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}
export const fetchTransport: Transport = async (url, headers, request) => {
  const response = await fetch(url, {
    headers,
    method: request?.method ?? "GET",
    body: request?.body,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, body: await response.json() };
};
export function createClient(
  baseUrl: string,
  transport: Transport = fetchTransport,
  token?: string | (() => string | undefined),
) {
  const base = baseUrl.replace(/\/$/, "");
  function checked<T>(result: { status: number; body: unknown }): T {
    if (result.status < 200 || result.status >= 300) {
      const b = result.body as {
        error?: {
          code?: string;
          message?: string;
          fieldErrors?: { path: string; message: string }[];
        };
        requestId?: string;
      };
      throw new ApiError(
        result.status,
        b.error?.code ?? "HTTP_ERROR",
        b.error?.message ?? "服务暂不可用",
        b.requestId,
        b.error?.fieldErrors ?? [],
      );
    }
    return result.body as T;
  }
  const headers = (): Record<string, string> => {
    const value = typeof token === "function" ? token() : token;
    return value ? { Authorization: "Bearer " + value } : {};
  };
  async function get<T>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const pairs = Object.entries(query)
      .filter(
        (e): e is [string, string | number | boolean] => e[1] !== undefined,
      )
      .map(
        ([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)),
      )
      .join("&");
    return checked<T>(
      await transport(base + path + (pairs ? "?" + pairs : ""), headers()),
    );
  }
  async function write<T>(
    method: string,
    path: string,
    body: unknown,
    key?: string,
  ): Promise<ObjectResponse<T>> {
    return checked(
      await transport(
        base + path,
        {
          ...headers(),
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        { method, body: JSON.stringify(body) },
      ),
    );
  }
  return {
    assetRequest: (id: string, assetId: string) => ({ url: base + "/admin/products/" + encodeURIComponent(id) + "/assets/" + encodeURIComponent(assetId) + "/content", headers: headers() }),
    async mediaAssetUrl(id: string, assetId: string) {
      const response = await fetch(base + "/admin/media-session", { method: "POST", headers: headers(), credentials: "include", signal: AbortSignal.timeout(20000) });
      if (response.status !== 204) checked({ status: response.status, body: await response.json() });
      return base + "/admin/products/" + encodeURIComponent(id) + "/assets/" + encodeURIComponent(assetId) + "/content";
    },
    analyticsNotice: () => get<Responses["AnalyticsNoticeResponse"]>("/catalog/analytics"),
    analyticsSettings: () => get<Responses["AnalyticsSettingsResponse"]>("/admin/analytics/settings"),
    updateAnalyticsSettings: (body: Domain["AnalyticsSettingsWrite"]) => write<Responses["AnalyticsSettings"]>("PUT", "/admin/analytics/settings", body),
    submitAnalyticsView: (body: Domain["AnalyticsViewSubmit"]) => write<{ accepted: true }>("POST", "/catalog/analytics/views", body),
    analyticsEvents: (q: Record<string, string | number | undefined> = {}) => get<Responses["AnalyticsEventListResponse"]>("/admin/analytics/events", q),
    analyticsSummary: () => get<Responses["AnalyticsSummaryResponse"]>("/admin/analytics/summary"),
    publicSiteBanner: () => get<Responses["SiteBannerResponse"]>("/catalog/site-banner"),
    adminSiteBanner: () => get<Responses["SiteBannerResponse"]>("/admin/site-banner"),
    updateSiteBanner: (body: Domain["SiteBannerWrite"]) => write<Responses["SiteBanner"]>("PUT", "/admin/site-banner", body),
    publicSiteContact: () => get<Responses["SiteContactResponse"]>("/catalog/site-contact"),
    adminSiteContact: () => get<Responses["SiteContactResponse"]>("/admin/site-contact"),
    updateSiteContact: (body: Domain["SiteContactWrite"]) => write<Responses["SiteContact"]>("PUT", "/admin/site-contact", body),
    submitFeedback: (body: Domain["FeedbackSubmit"]) => write<{ accepted: true }>("POST", "/catalog/feedback", body),
    feedback: (q: Record<string, string | number | undefined> = {}) => get<Responses["FeedbackListResponse"]>("/admin/feedback", q),
    publicCategories: () =>
      get<Responses["PublicCategoryListResponse"]>("/catalog/categories"),
    publicProducts: (q: Record<string, string | number | undefined> = {}) =>
      get<Responses["PublicProductSummaryListResponse"]>(
        "/catalog/products",
        q,
      ),
    publicProduct: (id: string) =>
      get<Responses["PublicProductResponse"]>(
        "/catalog/products/" + encodeURIComponent(id),
      ),
    materials: (q: Record<string, string | number | undefined> = {}) =>
      get<Responses["CatalogMaterialRowListResponse"]>("/catalog/materials", q),
    manifest: (id: string, materialId: string) =>
      get<Responses["PreviewManifestResponse"]>(
        "/catalog/products/" +
          encodeURIComponent(id) +
          "/materials/" +
          encodeURIComponent(materialId) +
          "/preview",
      ),
    me: () => get<Responses["AdminIdentityResponse"]>("/admin/me"),
    createCategory: (body: Domain["CategoryWrite"]) =>
      write<Category>("POST", "/admin/categories", body),
    updateCategory: (id: string, body: Domain["CategoryWrite"]) =>
      write<Category>(
        "PATCH",
        "/admin/categories/" + encodeURIComponent(id),
        body,
      ),
    users: () => get<Responses["AdminUserListResponse"]>("/admin/users"),
    createUser: (body: Domain["AdminUserWrite"]) =>
      write<Responses["AdminUser"]>("POST", "/admin/users", body),
    updateUser: (id: string, body: Domain["AdminUserWrite"]) =>
      write<Responses["AdminUser"]>(
        "PATCH",
        "/admin/users/" + encodeURIComponent(id),
        body,
      ),
    categories: () => get<ListResponse<Category>>("/admin/categories"),
    templates: (
      q: {
        templateId?: string;
        version?: number;
        includeDisabled?: boolean;
      } = {},
    ) => get<ListResponse<Template>>("/admin/templates", q),
    products: (q: Record<string, string | number | boolean | undefined> = {}) =>
      get<ListResponse<AdminProductRow>>("/admin/products", q),
    draft: (id: string) =>
      get<ObjectResponse<AdminDraft>>(
        "/admin/products/" + encodeURIComponent(id) + "/draft",
      ),
    materialVersions: (id: string, q: Record<string, string | number | undefined> = {}) =>
      get<Responses["MaterialVersionListResponse"]>("/admin/products/" + encodeURIComponent(id) + "/material-versions", q),
    create: (body: Domain["CreateProduct"], key: string) =>
      write<AdminDraft>("POST", "/admin/products", body, key),
    save: (id: string, body: Domain["SaveDraft"]) =>
      write<AdminDraft>(
        "PATCH",
        "/admin/products/" + encodeURIComponent(id) + "/draft",
        body,
      ),
    preview: (id: string, version: number) =>
      get<ObjectResponse<AdminDraft>>(
        "/admin/products/" + encodeURIComponent(id) + "/preview",
        { expectedDraftVersion: version },
      ),
    publish: (id: string, body: Domain["PublishProduct"], key: string) =>
      write<Responses["PublishResult"]>(
        "POST",
        "/admin/products/" + encodeURIComponent(id) + "/publish",
        body,
        key,
      ),
    unpublish: (id: string, body: Domain["UnpublishProduct"], key: string) =>
      write<Responses["UnpublishResult"]>(
        "POST",
        "/admin/products/" + encodeURIComponent(id) + "/unpublish",
        body,
        key,
      ),
    removeProduct: (id: string, body: Domain["ProductRemoval"], key: string) => write<AdminDraft>("POST", "/admin/products/" + encodeURIComponent(id) + "/remove", body, key),
    restoreProduct: (id: string, body: Domain["ProductRemoval"], key: string) => write<AdminDraft>("POST", "/admin/products/" + encodeURIComponent(id) + "/restore", body, key),
    audit: (q: Record<string, string | number | undefined> = {}) =>
      get<Responses["AuditEventListResponse"]>("/admin/audit-events", q),
    createUpload: (body: Domain["UploadIntent"], key: string) =>
      write<Responses["UploadIntentResult"]>(
        "POST",
        "/admin/uploads",
        body,
        key,
      ),
    uploadStatus: (id: string) =>
      get<Responses["UploadResultResponse"]>(
        "/admin/uploads/" + encodeURIComponent(id),
      ),
    async completeUpload(id: string) {
      const response = await fetch(base + "/admin/uploads/complete", {
        method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: id }), signal: AbortSignal.timeout(35 * 60 * 1000),
      });
      return checked<Responses["UploadResultResponse"]>({ status: response.status, body: await response.json() });
    },
    async putBytes(id: string, body: Blob, onProgress?: (sent: number, total: number) => void) {
      if (typeof XMLHttpRequest !== "undefined") {
        // Native File/Blob upload keeps the payload outside JavaScript strings
        // and provides progress without arrayBuffer/base64 copies.
        return new Promise<Responses["UploadResultResponse"]>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", base + "/admin/uploads/" + encodeURIComponent(id) + "/content");
          xhr.responseType = "json"; xhr.timeout = 15 * 60 * 1000;
          for (const [key,value] of Object.entries({ ...headers(), "Content-Type": "application/octet-stream" })) xhr.setRequestHeader(key,value);
          xhr.upload.onprogress = event => onProgress?.(event.loaded, event.lengthComputable ? event.total : body.size);
          xhr.onload = () => { try { resolve(checked({status:xhr.status,body:xhr.response})); } catch (error) { reject(error); } };
          xhr.onerror = () => reject(new ApiError(0,"NETWORK_ERROR","上传连接中断，请检查网络后重试"));
          xhr.ontimeout = () => reject(new ApiError(408,"UPLOAD_TIMEOUT","上传超过 15 分钟，请检查网络后重试"));
          xhr.onabort = () => reject(new ApiError(0,"UPLOAD_CANCELLED","上传已取消"));
          xhr.send(body);
        });
      }
      const response = await fetch(
        base + "/admin/uploads/" + encodeURIComponent(id) + "/content",
        {
          method: "PUT",
          headers: { ...headers(), "Content-Type": "application/octet-stream" },
          body,
          signal: AbortSignal.timeout(15 * 60 * 1000),
        },
      );
      return checked<Responses["UploadResultResponse"]>({
        status: response.status,
        body: await response.json(),
      });
    },
    async asset(id: string, assetId: string) {
      const response = await fetch(
        base +
          "/admin/products/" +
          encodeURIComponent(id) +
          "/assets/" +
          encodeURIComponent(assetId) +
          "/content",
        {
          headers: headers(),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        checked({ status: response.status, body: await response.json() });
      return response.blob();
    },
  };
}

export { technicalLabels } from "./field-labels";
