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
  ): Awaitable<Responses["AdminIdentity"]>;
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
  create: Method<"create">;
  save: Method<"save">;
  publish: Method<"publish">;
  unpublish: Method<"unpublish">;
  createUpload: Method<"createUpload">;
  publicCategories: Method<"publicCategories">;
  publicProduct: Method<"publicProduct">;
  manifest: Method<"manifest">;
  previewAsset: Method<"previewAsset">;
  mediaAsset: Method<"mediaAsset">;
  uploadResult(id: string): Awaitable<Responses["UploadResult"]>;
  put(id: string, req: IncomingMessage): Promise<Responses["UploadResult"]>;
  complete(id: string): Promise<Responses["UploadResult"]>;
  bytes(
    productId: string,
    assetId: string,
  ): Promise<
    Awaited<ReturnType<AssetStore["bytes"]>> & { cleanup?: () => Promise<void> }
  >;
};
export function filters(engine: DomainEngine) {
  return {
    listProducts(q: Query) {
      const term = String(q.q ?? "").toLocaleLowerCase();
      return [...engine.products.values()]
        .filter(
          (p) =>
            (!term ||
              [p.draft.name, ...(p.draft.aliases ?? [])].some((v) =>
                v.toLocaleLowerCase().includes(term),
              )) &&
            (!q.categoryId || q.categoryId === p.draft.categoryId) &&
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
