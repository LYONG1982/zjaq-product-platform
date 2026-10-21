import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import type { Domain } from "@zj/contracts";
import { assertSchema } from "@zj/contracts/validation";
import { queryTemplates, type TemplateQuery } from "@zj/template-registry";

import { validateQuery, checkResponse } from "../../mock-api/src/contract";
import type { Backend } from "../../domain/src/backend";
import { AppError, requireValue, validateBody } from "./errors";
import { actorContext } from "./identity";
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
async function jsonBody(req: IncomingMessage) {
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
      size <= 2 * 1024 * 1024,
      413,
      "FILE_TOO_LARGE",
      "请求正文超出 2 MiB",
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
) {
  const { path, size, upload, cleanup } = await store.bytes(productId, assetId);
  res.on("close", () => {
    void cleanup?.();
  });
  let start = 0,
    end = size - 1,
    status = 200;
  const range = req.headers.range;
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
  await checkCurrent?.();
  res.setHeader("Content-Type", upload.mimeType!);
  res.setHeader("Content-Length", String(end - start + 1));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
  if (status === 206)
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  res.writeHead(status);
  const stream = createReadStream(path, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
export function makeApiServer(
  store: Backend,
  options: { origins?: string[]; hosts?: string[] } = {},
) {
  const rates = new Map<string, { minute: number; count: number }>();
  const server = createServer((req, res) => {
    actorContext.run(undefined as never, () => {
      void handle(req, res);
    });
  });
  server.requestTimeout = 30000;
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
      const ip = req.socket.remoteAddress ?? "",
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
        currentIdentity = await store.authenticate(req.headers.authorization);
        actorContext.enterWith(currentIdentity);
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
            await binary(store, id, assetId, req, res, async () => {
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
            id,
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
