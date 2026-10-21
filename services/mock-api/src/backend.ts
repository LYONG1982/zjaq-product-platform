import type { Backend } from "../../domain/src/backend";
import { filters } from "../../domain/src/backend";
import { requireValue } from "./errors";
import { MockStore } from "./store";
export function mockBackend(store: MockStore, env: NodeJS.ProcessEnv): Backend {
  const bind = <K extends keyof MockStore>(key: K) =>
    (store[key] as Function).bind(store);
  return {
    provider: "mock",
    sessionId: store.sessionId,
    ...filters(store),
    authenticate(header) {
      const id =
        header === "Bearer local-mock"
          ? "mock-content-manager"
          : env.ENABLE_MOCK_ROLES === "true" && header === "Bearer local-admin"
            ? "mock-admin"
            : undefined;
      const u = id ? store.users.get(id) : undefined;
      requireValue(u?.enabled, 401, "SESSION_EXPIRED", "本地模拟身份不可用");
      const { version, ...identity } = u;
      return identity;
    },
    categories: bind("adminCategories"),
    users: bind("adminUsers"),
    writeCategory: bind("writeCategory"),
    writeUser: bind("writeUser"),
    draft: bind("draft"),
    preview: bind("preview"),
    create: bind("create"),
    save: bind("save"),
    publish: bind("publish"),
    unpublish: bind("unpublish"),
    createUpload: bind("createUpload"),
    publicCategories: bind("publicCategories"),
    publicProduct: bind("publicProduct"),
    manifest: bind("manifest"),
    previewAsset: bind("previewAsset"),
    mediaAsset: bind("mediaAsset"),
    uploadResult: (id) => store.assets.result(store.assets.get(id)),
    put: (id, req) => store.assets.put(id, req),
    complete: (id) => store.assets.complete(id),
    bytes: (id, asset) => store.assets.bytes(id, asset),
  };
}
