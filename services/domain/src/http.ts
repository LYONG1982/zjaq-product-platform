import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import type { Domain } from "@zj/contracts";
import { assertSchema } from "@zj/contracts/validation";
import { queryTemplates, type TemplateQuery } from "@zj/template-registry";

import { validateQuery, checkResponse } from "../../mock-api/src/contract";
import type { Backend } from "../../domain/src/backend";
import { AppError, requireValue, validateBody } from "./errors";
import { mediaSessions } from "./media-session";
import { zipDownload } from "./zip-download";
import { actorContext } from "./identity";
import { visibleSiteBanner } from "./site-banner";
import { publicAnalyticsSettings, analyticsSummary, filterAnalytics, sourceIp } from "./analytics";
const allowedOrigins = new Set(
  [3200, 3201, 3202, 3300, 3301, 3302, 3400, 3401, 3402].flatMap((p) => [
    "http://127.0.0.1:" + p,
    "http://localhost:" + p,
  ]),
);
function page<T>(data: T[], q: Record<string, string | number | boolean>) {
  const key = createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(q)
          .filter(([k]) => k !== "cursor")
          .sort(),
      ),
    )
    .digest("hex")
    .slice(0, 16);
  let offset = 0;
  if (q.cursor)
    try {
      const d = JSON.parse(
        Buffer.from(String(q.cursor), "base64url").toString(),
      );
      if (d.key !== key || !Number.isSafeInteger(d.offset) || d.offset < 0)
        throw new Error();
      offset = d.offset;
    } catch {
      throw new AppError(400, "INVALID_ARGUMENT", "分页标记无效，请重新查询");
    }
  const limit = Number(q.limit ?? 20),
    hasMore = offset + limit < data.length;
  return {
    data: data.slice(offset, offset + limit),
    page: {
      nextCursor: hasMore
        ? Buffer.from(JSON.stringify({ offset: offset + limit, key })).toString(
            "base64url",
          )
        : null,
      hasMore,
    },
  };
}
async function jsonBody(req: IncomingMessage, maxBytes = 2 * 1024 * 1024) {
  requireValue(
    req.headers["content-type"]?.split(";")[0] === "application/json",
    400,
    "INVALID_ARGUMENT",
    "请求需使用 JSON",
  );
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    requireValue(
      size <= maxBytes,
      413,
      "FILE_TOO_LARGE",
      `请求正文超出 ${Math.floor(maxBytes / (1024 * 1024))} MiB`,
    );
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "INVALID_ARGUMENT", "JSON 正文无效");
  }
}
async function binary(
  store: Backend,
  productId: string,
  assetId: string,
  req: IncomingMessage,
  res: ServerResponse,
  checkCurrent?: () => void | Promise<unknown>,
  downloadName?: string,
  downloadPurpose?: "source" | "preview",
  onCompletedDownload?: () => Promise<void>,
) {
  const { path, size, upload, cleanup } = await store.bytes(productId, assetId, downloadName !== undefined);
  if (req.aborted || res.destroyed) { await cleanup?.(); return; }
  res.on("close", () => {
    void cleanup?.();
  });
  const sendingDeadline = setTimeout(() => res.destroy(), 15 * 60 * 1000); sendingDeadline.unref();
  res.setTimeout(30000, () => res.destroy());
  res.once("close", () => clearTimeout(sendingDeadline));
  let start = 0,
    end = size - 1,
    status = 200;
  const range = req.headers.range;
  // Recheck before any response, including 416, so a revoked resource does not
  // disclose its length through an invalid Range request.
  await store.assertProductReadable(productId);
  await checkCurrent?.();
  if (downloadName !== undefined)
    requireValue(upload.purpose === downloadPurpose, 404, "RESOURCE_UNAVAILABLE", "此资料没有可下载文件");
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    let valid = Boolean(m && (m[1] || m[2]));
    if (m && valid) {
      if (!m[1]) {
        const suffix = Number(m[2]);
        valid = Number.isSafeInteger(suffix) && suffix > 0;
        start = Math.max(0, size - suffix);
      } else {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
        valid =
          Number.isSafeInteger(start) &&
          Number.isSafeInteger(end) &&
          start < size &&
          end >= start;
      }
    }
    if (!valid) {
      res.writeHead(416, {
        "Content-Range": "bytes */" + size,
        "Accept-Ranges": "bytes",
        "Content-Length": "0",
      });
      res.end();
      return;
    }
    status = 206;
  }
  res.setHeader("Content-Type", upload.mimeType!);
  res.setHeader("Content-Length", String(end - start + 1));
  res.setHeader("Accept-Ranges", "bytes");
  const originalExtension = upload.fileExtension ?? upload.type;
  const extension = ["pptx", "docx", "pdf", "mp4", "mov", "webm", "png", "jpg", "jpeg", "webp"].includes(originalExtension.toLowerCase()) ? "." + originalExtension : "";
  const safeName = downloadName?.replace(/[\u0000-\u001f\u007f/\\]/g, " ").trim().slice(0, 100) || "material";
  const encodedName = encodeURIComponent(Buffer.from(safeName + extension, "utf8").toString("utf8")).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  res.setHeader("Content-Disposition", downloadName === undefined ? "inline" : `attachment; filename="material${extension}"; filename*=UTF-8''${encodedName}`);
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  if (status === 206)
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  if (status === 200 && downloadName !== undefined && onCompletedDownload) res.once("finish", () => {
    // Count one complete server response, never preview/range chunks or aborted transfers.
    void onCompletedDownload().catch(() => console.error(JSON.stringify({ event: "analytics_capture_failed" })));
  });
  res.writeHead(status);
  const stream = createReadStream(path, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
export function makeApiServer(
  store: Backend,
  options: { origins?: string[]; hosts?: string[]; trustedProxyAddresses?: string[] } = {},
) {
  const media = mediaSessions(store.provider === "cloudbase", process.env.ADMIN_MEDIA_SESSION_SECRET);
  const rates = new Map<string, { minute: number; count: number }>();
  const server = createServer((req, res) => {
    actorContext.run(undefined as never, () => {
      void handle(req, res);
    });
  });
  server.requestTimeout = 15 * 60 * 1000;
  server.headersTimeout = 10000;
  server.maxRequestsPerSocket = 100;
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const requestId = randomUUID();
    const started = Date.now();
    if (store.provider === "cloudbase")
      res.on("finish", () =>
        console.log(
          JSON.stringify({
            event: "http_request",
            requestId,
            method: req.method,
            status: res.statusCode,
            durationMs: Date.now() - started,
          }),
        ),
      );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Request-Id", requestId);
    const send = (status: number, body: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(body));
    };
    const success = (op: string, body: Record<string, unknown>) => {
      const result = { ...body, requestId };
      checkResponse(op, result);
      send(200, result);
    };
    const query = (op: string, url: URL) => {
      try {
        return validateQuery(op, url.searchParams);
      } catch {
        throw new AppError(400, "INVALID_ARGUMENT", "请求参数无效");
      }
    };
    try {
      const origin = req.headers.origin;
      requireValue(
        !origin ||
          (options.origins
            ? options.origins.includes(origin)
            : allowedOrigins.has(origin)),
        403,
        "ORIGIN_NOT_ALLOWED",
        "来源不可用",
      );
      const host = req.headers.host ?? "";
      requireValue(
        options.hosts
          ? options.hosts.includes(host)
          : /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host),
        403,
        "ORIGIN_NOT_ALLOWED",
        "Host 不可用",
      );
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
      }
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Range, Content-Length, Accept-Ranges, X-Request-Id",
      );
      if (req.method === "OPTIONS") {
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PATCH, PUT, OPTIONS",
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Authorization, Content-Type, Idempotency-Key, Range",
        );
        res.writeHead(204);
        res.end();
        return;
      }
      const ip = sourceIp(req, options.trustedProxyAddresses),
        minute = Math.floor(Date.now() / 60000),
        rate = rates.get(ip);
      if (!rate || rate.minute !== minute) rates.set(ip, { minute, count: 1 });
      else {
        rate.count++;
        requireValue(
          rate.count <= 1500,
          429,
          "RATE_LIMITED",
          "请求过于频繁，请稍后重试",
        );
      }
      await store.throttle?.(ip);
      const url = new URL(req.url ?? "/", "http://127.0.0.1"),
        path = url.pathname,
        method = req.method,
        key =
          typeof req.headers["idempotency-key"] === "string"
            ? req.headers["idempotency-key"]
            : undefined;
      let currentIdentity;
      if (path.startsWith("/api/v1/admin/")) {
        const mediaCookie = method === "GET" && /^\/api\/v1\/admin\/products\/[^/]+\/assets\/[^/]+\/content$/.test(path)
          ? req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith("zj_admin_media="))?.slice(15) : undefined;
        currentIdentity = await store.authenticate(req.headers.authorization ?? (media.read(mediaCookie) ? "Bearer " + media.read(mediaCookie) : undefined));
        requireValue(
          currentIdentity.role === "ADMIN" ||
            currentIdentity.role === "CONTENT_MANAGER",
          403,
          "FORBIDDEN",
          "此接口仅限后台身份",
        );
        actorContext.enterWith(currentIdentity);
      } else if (path.startsWith("/api/v1/sales/")) {
        currentIdentity = await store.authenticate(req.headers.authorization);
        requireValue(
          currentIdentity.role === "SALES",
          403,
          "FORBIDDEN",
          "此接口仅限销售身份",
        );
        actorContext.enterWith(currentIdentity);
      }
      if (path === "/api/v1/admin/media-session" && method === "POST") {
        requireValue(!!req.headers.authorization?.startsWith("Bearer "), 401, "SESSION_EXPIRED", "请重新登录");
        // Read-only media cookie is never accepted for mutations or other admin APIs.
        res.setHeader("Set-Cookie", "zj_admin_media=" + media.issue(req.headers.authorization!.slice(7)) + "; HttpOnly; SameSite=Strict; Max-Age=300; Path=/api/v1/admin/products/" + (store.provider === "cloudbase" ? "; Secure" : ""));
        res.writeHead(204); res.end(); return;
      }
      if (path === "/health" && method === "GET") {
        send(200, {
          status: "ok",
          provider: store.provider,
          scope: "TASK-02/03",
          sessionId: store.sessionId,
          requestId,
        });
        return;
      }
      if (method === "GET") {
        if (path === "/api/v1/catalog/analytics") {
          query("getAnalyticsNotice", url);
          success("getAnalyticsNotice", { data: publicAnalyticsSettings(await store.analyticsSettings()) });
          return;
        }
        if (path === "/api/v1/admin/analytics/settings") {
          requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护统计设置");
          query("getAnalyticsSettings", url);
          success("getAnalyticsSettings", { data: await store.analyticsSettings() });
          return;
        }
        if (path === "/api/v1/admin/analytics/events") {
          requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可查看统计记录");
          const q = query("listAnalyticsEvents", url);
          success("listAnalyticsEvents", page(filterAnalytics(await store.analyticsEvents(), q), q));
          return;
        }
        if (path === "/api/v1/admin/analytics/summary") {
          requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可查看数据看板");
          query("getAnalyticsSummary", url);
          requireValue((await store.analyticsSettings()).dashboardEnabled, 403, "FORBIDDEN", "数据看板已关闭，请在系统设置中启用");
          success("getAnalyticsSummary", { data: analyticsSummary(await store.analyticsEvents()) });
          return;
        }
        if (path === "/api/v1/admin/feedback") {
          requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可查看反馈");
          const q = query("listFeedback", url);
          success("listFeedback", page(await store.listFeedback(), q));
          return;
        }
        if (path === "/api/v1/catalog/site-contact") {
          query("getPublicSiteContact", url);
          success("getPublicSiteContact", { data: await store.siteContact() });
          return;
        }
        if (path === "/api/v1/admin/site-contact") {
          requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护联系方式");
          query("getAdminSiteContact", url);
          success("getAdminSiteContact", { data: await store.siteContact() });
          return;
        }
        if (path === "/api/v1/catalog/site-banner") {
          query("getPublicSiteBanner", url);
          success("getPublicSiteBanner", { data: visibleSiteBanner(await store.siteBanner()) });
          return;
        }
        if (path === "/api/v1/catalog/site-banner/default-image") {
          query("getDefaultSiteBannerImage", url);
          let image: Buffer;
          try { image = await readFile(new URL("../assets/default-banner.png", import.meta.url)); }
          catch { throw new AppError(503, "NOT_INITIALIZED", "默认 Banner 素材不可用"); }
          res.writeHead(200, { "Content-Type": "image/png", "Content-Length": image.length, "Cache-Control": "public, max-age=300" });
          res.end(image);
          return;
        }
        if (path === "/api/v1/admin/site-banner") {
          requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护 Banner");
          query("getAdminSiteBanner", url);
          success("getAdminSiteBanner", { data: await store.siteBanner() });
          return;
        }
        if (path === "/api/v1/sales/catalog/products") {
          const q = query("listSalesProducts", url);
          for (const date of [q.updatedFrom, q.updatedTo]) {
            if (date) {
              const value = String(date), parsed = new Date(value + "T00:00:00Z");
              requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 400, "INVALID_ARGUMENT", "日期无效");
            }
          }
          requireValue(!q.updatedFrom || !q.updatedTo || String(q.updatedFrom) <= String(q.updatedTo), 400, "INVALID_ARGUMENT", "开始日期不能晚于结束日期");
          success("listSalesProducts", page(await store.listSalesProducts(q), q));
          return;
        }
        if (path === "/api/v1/sales/catalog/materials") {
          const q = query("listSalesMaterials", url);
          success("listSalesMaterials", page(await store.listSalesMaterials(q), q));
          return;
        }
        const salesMedia = path.match(/^\/api\/v1\/sales\/catalog\/products\/([^/]+)\/media\/([^/]+)$/);
        if (salesMedia) {
          const q = query("streamSalesMedia", url), id = decodeURIComponent(salesMedia[1]), mediaId = decodeURIComponent(salesMedia[2]);
          const resolve = () => store.mediaAsset(id, mediaId, String(q.releaseId));
          const asset = await resolve();
          await binary(store, await store.resolvePublicId(id), asset, req, res, async () => {
            requireValue(await resolve() === asset, 409, "VERSION_CHANGED", "产品资料已更新");
          });
          return;
        }
        const salesProduct = path.match(/^\/api\/v1\/sales\/catalog\/products\/([^/]+)$/);
        if (salesProduct) {
          query("getSalesProduct", url);
          success("getSalesProduct", { data: await store.salesProduct(decodeURIComponent(salesProduct[1])) });
          return;
        }
        const salesFile = path.match(/^\/api\/v1\/sales\/catalog\/products\/([^/]+)\/materials\/([^/]+)\/(preview(?:\/content)?|source)$/);
        if (salesFile) {
          const id = decodeURIComponent(salesFile[1]), materialId = decodeURIComponent(salesFile[2]);
          if (salesFile[3] === "preview") {
            query("getSalesPreview", url);
            success("getSalesPreview", { data: await store.salesManifest(id, materialId) });
          } else if (salesFile[3] === "preview/content") {
            const q = query("streamSalesPreview", url);
            const resolve = () => store.salesPreviewAsset(id, materialId, String(q.releaseId), String(q.versionId), String(q.part));
            const asset = await resolve();
            await binary(store, await store.resolvePublicId(id), asset, req, res, async () => {
              requireValue(await resolve() === asset, 409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
            });
          } else {
            const q = query("downloadSalesSource", url);
            const resolve = () => store.salesSourceAsset(id, materialId, String(q.releaseId), String(q.versionId));
            const source = await resolve();
            const checkDownload = async () => {
              const current = await resolve();
              requireValue(current.assetId === source.assetId && JSON.stringify(current.assetIds) === JSON.stringify(source.assetIds) && current.purpose === source.purpose, 409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
            };
            const recordDownload = async () => {
              await store.captureAnalytics({ kind: "DOWNLOAD", productId: id, materialId, releaseId: String(q.releaseId), versionId: String(q.versionId), client: "SALES_PC", eventKey: requestId, sourceIp: ip });
            };
            if (source.assetIds) {
              res.once("finish", () => { if (res.statusCode === 200 && res.writableFinished) void recordDownload().catch(() => console.error(JSON.stringify({ event: "analytics_capture_failed", kind: "DOWNLOAD" }))); });
              await zipDownload(store, await store.resolvePublicId(id), source.assetIds, res, checkDownload, source.name);
            } else await binary(store, await store.resolvePublicId(id), source.assetId!, req, res, checkDownload, source.name, source.purpose, recordDownload);
          }
          return;
        }
        if (path === "/api/v1/sales/me") {
          query("getSalesMe", url);
          success("getSalesMe", { data: currentIdentity });
          return;
        }
        if (path === "/api/v1/admin/me") {
          query("getAdminMe", url);
          success("getAdminMe", { data: currentIdentity });
          return;
        }
        if (path === "/api/v1/admin/users") {
          query("listAdminUsers", url);
          success("listAdminUsers", {
            data: await store.users(),
            page: { nextCursor: null, hasMore: false },
          });
          return;
        }
        if (path === "/api/v1/admin/categories") {
          query("listAdminCategories", url);
          success("listAdminCategories", {
            data: await store.categories(),
            page: { nextCursor: null, hasMore: false },
          });
          return;
        }
        if (path === "/api/v1/admin/templates") {
          const q = query("listTemplates", url);
          success("listTemplates", {
            data: queryTemplates(q as TemplateQuery),
            page: { nextCursor: null, hasMore: false },
          });
          return;
        }
        if (path === "/api/v1/admin/products") {
          const q = query("listAdminProducts", url);
          if (q.removed === true) requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可查看已移除产品");
          if (q.publicationState)
            requireValue(
              ["DRAFT", "PUBLISHED", "OFFLINE"].includes(
                String(q.publicationState),
              ),
              400,
              "INVALID_ARGUMENT",
              "发布状态无效",
            );
          const rows = await store.listProducts(q);
          success("listAdminProducts", page(rows, q));
          return;
        }
        if (path === "/api/v1/admin/audit-events") {
          const q = query("listAuditEvents", url);
          success("listAuditEvents", page(await store.listAudit(q), q));
          return;
        }
        const history = path.match(/^\/api\/v1\/admin\/products\/([^/]+)\/material-versions$/);
        if (history) {
          const q = query("listMaterialVersions", url);
          success("listMaterialVersions", page(await store.materialVersions(decodeURIComponent(history[1])), q));
          return;
        }
        const productMatch = path.match(
          /^\/api\/v1\/admin\/products\/([^/]+)\/(draft|preview)$/,
        );
        if (productMatch) {
          const id = decodeURIComponent(productMatch[1]),
            op =
              productMatch[2] === "draft"
                ? "getProductDraft"
                : "previewProductDraft",
            q = query(op, url);
          success(op, {
            data:
              op === "getProductDraft"
                ? await store.draft(id)
                : await store.preview(id, Number(q.expectedDraftVersion)),
          });
          return;
        }
        const upload = path.match(/^\/api\/v1\/admin\/uploads\/([^/]+)$/);
        if (upload) {
          query("getUpload", url);
          success("getUpload", {
            data: await store.uploadResult(decodeURIComponent(upload[1])),
          });
          return;
        }
        const asset = path.match(
          /^\/api\/v1\/admin\/products\/([^/]+)\/assets\/([^/]+)\/content$/,
        );
        if (asset) {
          query("streamDraftAsset", url);
          await binary(store, asset[1], decodeURIComponent(asset[2]), req, res);
          return;
        }
        if (path === "/api/v1/catalog/categories") {
          const q = query("listPublicCategories", url);
          success(
            "listPublicCategories",
            page(await store.publicCategories(), q),
          );
          return;
        }
        if (path === "/api/v1/catalog/products") {
          const q = query("listPublicProducts", url);
          success(
            "listPublicProducts",
            page(await store.listPublicProducts(q), q),
          );
          return;
        }
        if (path === "/api/v1/catalog/materials") {
          const q = query("listCurrentMaterials", url),
            term = String(q.q ?? "").toLocaleLowerCase();
          success(
            "listCurrentMaterials",
            page(await store.listMaterials(q), q),
          );
          return;
        }
        const publicProduct = path.match(
          /^\/api\/v1\/catalog\/products\/([^/]+)$/,
        );
        if (publicProduct) {
          query("getPublicProduct", url);
          success("getPublicProduct", {
            data: await store.publicProduct(
              decodeURIComponent(publicProduct[1]),
            ),
          });
          return;
        }
        const preview = path.match(
          /^\/api\/v1\/catalog\/products\/([^/]+)\/materials\/([^/]+)\/preview(\/content)?$/,
        );
        if (preview) {
          const id = decodeURIComponent(preview[1]),
            m = decodeURIComponent(preview[2]);
          if (!preview[3]) {
            query("getCurrentPreview", url);
            success("getCurrentPreview", { data: await store.manifest(id, m) });
          } else {
            const q = query("streamCurrentPreview", url),
              assetId = await store.previewAsset(
                id,
                m,
                String(q.releaseId),
                String(q.versionId),
                String(q.part),
              );
            await binary(store, await store.resolvePublicId(id), assetId, req, res, async () => {
              await store.previewAsset(
                id,
                m,
                String(q.releaseId),
                String(q.versionId),
                String(q.part),
              );
            });
          }
          return;
        }
        const media = path.match(
          /^\/api\/v1\/catalog\/products\/([^/]+)\/media\/([^/]+)$/,
        );
        if (media) {
          const q = query("streamCurrentMedia", url),
            id = decodeURIComponent(media[1]);
          await binary(
            store,
            await store.resolvePublicId(id),
            await store.mediaAsset(
              id,
              decodeURIComponent(media[2]),
              String(q.releaseId),
            ),
            req,
            res,
            async () => {
              await store.mediaAsset(
                id,
                decodeURIComponent(media[2]),
                String(q.releaseId),
              );
            },
          );
          return;
        }
      }
      if (method === "POST" && path === "/api/v1/catalog/analytics/views") {
        query("submitAnalyticsView", url);
        await store.submitAnalyticsView(await jsonBody(req), ip);
        success("submitAnalyticsView", { data: { accepted: true } });
        return;
      }
      if (method === "PUT" && path === "/api/v1/admin/analytics/settings") {
        requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护统计设置");
        query("updateAnalyticsSettings", url);
        success("updateAnalyticsSettings", { data: await store.writeAnalyticsSettings(await jsonBody(req), requestId) });
        return;
      }
      if (method === "POST" && path === "/api/v1/catalog/feedback") {
        query("submitFeedback", url);
        await store.submitFeedback(await jsonBody(req), ip);
        success("submitFeedback", { data: { accepted: true } });
        return;
      }
      if (method === "PUT" && path === "/api/v1/admin/site-contact") {
        requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护联系方式");
        query("updateAdminSiteContact", url);
        success("updateAdminSiteContact", { data: await store.writeSiteContact(await jsonBody(req), requestId) });
        return;
      }
      if (method === "PUT" && path === "/api/v1/admin/site-banner") {
        requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护 Banner");
        query("updateAdminSiteBanner", url);
        success("updateAdminSiteBanner", { data: await store.writeSiteBanner(await jsonBody(req, 3 * 1024 * 1024), requestId) });
        return;
      }
      const management = path.match(
        /^\/api\/v1\/admin\/(categories|users)(?:\/([^/]+))?$/,
      );
      if (
        management &&
        ((method === "POST" && !management[2]) ||
          (method === "PATCH" && management[2]))
      ) {
        requireValue(
          currentIdentity?.role === "ADMIN",
          403,
          "FORBIDDEN",
          "仅管理员可维护此内容",
        );
        const isCategory = management[1] === "categories",
          id = management[2] ? decodeURIComponent(management[2]) : undefined;
        const op = isCategory
          ? id
            ? "updateCategory"
            : "createCategory"
          : id
            ? "updateAdminUser"
            : "createAdminUser";
        query(op, url);
        const body = await jsonBody(req);
        success(op, {
          data: isCategory
            ? await store.writeCategory(id, body, requestId)
            : await store.writeUser(id, body, requestId),
        });
        return;
      }
      if (method === "POST" && path === "/api/v1/admin/products") {
        query("createProduct", url);
        success("createProduct", {
          data: await store.create(await jsonBody(req), key, requestId),
        });
        return;
      }
      const write = path.match(
        /^\/api\/v1\/admin\/products\/([^/]+)\/(draft|publish|unpublish)$/,
      );
      if (
        write &&
        ((method === "PATCH" && write[2] === "draft") ||
          (method === "POST" && ["publish", "unpublish"].includes(write[2])))
      ) {
        const id = decodeURIComponent(write[1]),
          op =
            write[2] === "draft"
              ? "saveProductDraft"
              : write[2] === "publish"
                ? "publishProduct"
                : "unpublishProduct";
        query(op, url);
        const body = await jsonBody(req);
        success(op, {
          data:
            write[2] === "draft"
              ? await store.save(id, body, requestId)
              : write[2] === "publish"
                ? await store.publish(id, body, key, requestId)
                : await store.unpublish(id, body, key, requestId),
        });
        return;
      }
      const removal = path.match(/^\/api\/v1\/admin\/products\/([^/]+)\/(remove|restore)$/);
      if (method === "POST" && removal) {
        requireValue(currentIdentity?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可移除或恢复产品");
        const id = decodeURIComponent(removal[1]), operation = removal[2] === "remove" ? "removeProduct" : "restoreProduct";
        query(operation, url);
        const body = await jsonBody(req);
        success(operation, { data: removal[2] === "remove" ? await store.removeProduct(id, body, key, requestId) : await store.restoreProduct(id, body, key, requestId) });
        return;
      }
      if (method === "POST" && path === "/api/v1/admin/uploads") {
        query("createUpload", url);
        success("createUpload", {
          data: await store.createUpload(await jsonBody(req), key),
        });
        return;
      }
      const put = path.match(/^\/api\/v1\/admin\/uploads\/([^/]+)\/content$/);
      if (method === "PUT" && put) {
        query("putUploadBytes", url);
        success("putUploadBytes", {
          data: await store.put(decodeURIComponent(put[1]), req),
        });
        return;
      }
      if (method === "POST" && path === "/api/v1/admin/uploads/complete") {
        query("completeUpload", url);
        const b = validateBody<Domain["UploadComplete"]>(
          "UploadComplete",
          await jsonBody(req),
        );
        success("completeUpload", {
          data: await store.complete(b.uploadId),
        });
        return;
      }
      throw new AppError(
        404,
        "RESOURCE_UNAVAILABLE",
        "资源不存在或尚未实现此操作",
      );
    } catch (cause) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const e =
        cause instanceof AppError
          ? cause
          : cause instanceof URIError
            ? new AppError(400, "INVALID_ARGUMENT", "路径编码无效")
            : new AppError(
                500,
                "INTERNAL_ERROR",
                "操作未完成，当前内容保持不变",
              );
      const body = {
        error: {
          code: e.code,
          message: e.message,
          ...(e.fields.length ? { fieldErrors: e.fields } : {}),
        },
        requestId,
      };
      assertSchema("domain", "Error", body);
      send(e.status, body);
    }
  }
  return server;
}
