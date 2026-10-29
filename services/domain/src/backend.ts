import type { IncomingMessage } from "node:http";
import type { Responses } from "@zj/contracts";
import type { DomainEngine } from "./engine";
import type { AssetStore } from "../../mock-api/src/assets";
export type Query = Record<string, string | number | boolean>;
type Awaitable<T> = T | Promise<T>;
type Method<K extends keyof DomainEngine> = DomainEngine[K] extends (
  ...args: infer A
) => infer R
  ? (...args: A) => Awaitable<R>
  : never;
export type Backend = {
  provider: "mock" | "cloudbase";
  sessionId?: string;
  throttle?(ip: string): Promise<void>;
  authenticate(
    header: string | undefined,
  ): Awaitable<Responses["AdminIdentity"] | Responses["SalesIdentity"]>;
  listProducts(q: Query): Awaitable<Responses["AdminProductRow"][]>;
  listPublicProducts(q: Query): Awaitable<Responses["PublicProductSummary"][]>;
  listMaterials(q: Query): Awaitable<Responses["CatalogMaterialRow"][]>;
  listAudit(q: Query): Awaitable<Responses["AuditEvent"][]>;
  categories: Method<"adminCategories">;
  users: Method<"adminUsers">;
  writeCategory: Method<"writeCategory">;
  writeUser: Method<"writeUser">;
  draft: Method<"draft">;
  preview: Method<"preview">;
  materialVersions: Method<"materialVersions">;
  create: Method<"create">;
  save: Method<"save">;
  publish: Method<"publish">;
  unpublish: Method<"unpublish">;
  removeProduct: Method<"removeProduct">;
  restoreProduct: Method<"restoreProduct">;
  assertProductWritable: Method<"assertProductWritable">;
  assertProductReadable: Method<"assertProductReadable">;
  createUpload: Method<"createUpload">;
  publicCategories: Method<"publicCategories">;
  publicProduct: Method<"publicProduct">;
  resolvePublicId: Method<"resolvePublicId">;
  manifest: Method<"manifest">;
  previewAsset: Method<"previewAsset">;
  mediaAsset: Method<"mediaAsset">;
  listSalesProducts(q: Query): Awaitable<Responses["PublicProductSummary"][]>;
  listSalesMaterials(q: Query): Awaitable<Responses["CatalogMaterialRow"][]>;
  salesProduct: Method<"salesProduct">;
  salesManifest: Method<"salesManifest">;
  salesPreviewAsset: Method<"salesPreviewAsset">;
  salesSourceAsset: Method<"salesSourceAsset">;
  siteBanner(): Awaitable<Responses["SiteBanner"]>;
  writeSiteBanner(body: unknown, requestId: string): Awaitable<Responses["SiteBanner"]>;
  siteContact(): Awaitable<Responses["SiteContact"]>;
  writeSiteContact(body: unknown, requestId: string): Awaitable<Responses["SiteContact"]>;
  submitFeedback(body: unknown, ip: string): Awaitable<void>;
  listFeedback(): Awaitable<Responses["FeedbackItem"][]>;
  analyticsSettings(): Awaitable<Responses["AnalyticsSettings"]>;
  writeAnalyticsSettings(body: unknown, requestId: string): Awaitable<Responses["AnalyticsSettings"]>;
  captureAnalytics(capture: import("./analytics").AnalyticsCapture): Awaitable<void>;
  submitAnalyticsView(body: unknown, ip: string): Awaitable<void>;
  analyticsEvents(): Awaitable<Responses["AnalyticsEvent"][]>;
  uploadResult(id: string): Awaitable<Responses["UploadResult"]>;
  put(id: string, req: IncomingMessage): Promise<Responses["UploadResult"]>;
  complete(id: string): Promise<Responses["UploadResult"]>;
  bytes(
    productId: string,
    assetId: string,
    original?: boolean,
  ): Promise<
    Awaited<ReturnType<AssetStore["bytes"]>> & { cleanup?: () => Promise<void> }
  >;
};
export function filters(engine: DomainEngine) {
  return {
    listProducts(q: Query) {
      if (q.removed === true) engine.assertRemovedProductsAccess();
      const term = String(q.q ?? "").toLocaleLowerCase();
      return [...engine.products.values()]
        .filter(
          (p) =>
            (q.removed === true ? !!p.deletedAt : !p.deletedAt) &&
            (!term ||
              [p.draft.name, ...(p.draft.aliases ?? [])].some((v) =>
                v.toLocaleLowerCase().includes(term),
              )) &&
            (!q.categoryId || q.categoryId === p.draft.categoryId) &&
            (!q.owner || p.draft.owner.toLocaleLowerCase().includes(String(q.owner).toLocaleLowerCase())) &&
            (!q.publicationState || q.publicationState === p.publicationState),
        )
        .map((p) => engine.row(p))
        .filter(
          (p) =>
            q.hasUnpublishedChanges === undefined ||
            q.hasUnpublishedChanges === p.hasUnpublishedChanges,
        )
        .sort((a, b) =>
          a.productId.localeCompare(b.productId, undefined, { numeric: true }),
        );
    },
    listPublicProducts(q: Query) {
      return engine
        .summaries()
        .filter(
          (s) =>
            (!q.categoryId || q.categoryId === s.categoryId) &&
            (!q.q || engine.matches(s.productId, String(q.q))),
        );
    },
    listSalesProducts(q: Query) {
      return engine.summaries().filter((s) =>
        (!q.categoryId || q.categoryId === s.categoryId) &&
        (!q.updatedFrom || Date.parse(s.publishedAt) >= Date.parse(`${q.updatedFrom}T00:00:00+08:00`)) &&
        (!q.updatedTo || Date.parse(s.publishedAt) < Date.parse(`${q.updatedTo}T00:00:00+08:00`) + 86400000) &&
        (!q.ownership || engine.current(engine.resolvePublicId(s.productId)).content.ownership === q.ownership) &&
        (!q.q || engine.salesMatches(s.productId, String(q.q))));
    },
    listSalesMaterials(q: Query) {
      const term = String(q.q ?? "").toLocaleLowerCase();
      return engine.currentSalesMaterials().filter((row) =>
        (!q.categoryId || q.categoryId === row.categoryId) &&
        (!q.productId || q.productId === row.productId) &&
        (!term || row.material.name.toLocaleLowerCase().includes(term) || engine.salesMatches(row.productId, term)));
    },
    listMaterials(q: Query) {
      const term = String(q.q ?? "").toLocaleLowerCase();
      return engine
        .currentMaterials()
        .filter(
          (s) =>
            (!q.categoryId || q.categoryId === s.categoryId) &&
            (!q.productId || q.productId === s.productId) &&
            (!term ||
              s.material.name.toLocaleLowerCase().includes(term) ||
              s.productName.toLocaleLowerCase().includes(term)),
        );
    },
    listAudit(q: Query) {
      return engine.events
        .filter(
          (e) =>
            (!q.productId || q.productId === e.targetId) &&
            (!q.action || q.action === e.action),
        )
        .slice()
        .reverse();
    },
  };
}
