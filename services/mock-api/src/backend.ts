import type { Backend } from "../../domain/src/backend";
import { filters } from "../../domain/src/backend";
import { requireValue } from "./errors";
import { MockStore } from "./store";
import { salesIdentity } from "../../domain/src/identity";
import { actorContext } from "../../domain/src/identity";
import { bannerFields, emptySiteBanner, normalizeSiteBanner, validateSiteBanner } from "../../domain/src/site-banner";
import { emptySiteContact, validateSiteContact } from "../../domain/src/site-contact";
import { validateFeedback } from "../../domain/src/feedback";
import { emptyAnalyticsSettings, validateAnalyticsSettings, validateAnalyticsView, analyticsRecord, analyticsKey, recentAnalytics, type StoredAnalyticsEvent, type AnalyticsCapture } from "../../domain/src/analytics";
import { randomUUID } from "node:crypto";
export function mockBackend(store: MockStore, env: NodeJS.ProcessEnv): Backend {
  if (env.ENABLE_MOCK_ROLES === "true" && !store.users.has(salesIdentity.userId))
    store.users.set(salesIdentity.userId, { ...salesIdentity, version: 1 });
  const bind = <K extends keyof MockStore>(key: K) =>
    (store[key] as Function).bind(store);
  let banner = emptySiteBanner();
  let contact = emptySiteContact();
  let analytics = emptyAnalyticsSettings();
  const analyticsRows = new Map<string, StoredAnalyticsEvent>();
  const analyticsRates = new Map<string, number>();
  const captureAnalytics = (capture: AnalyticsCapture) => {
    for (const [key, row] of analyticsRows) if (row.expiresAt.getTime() <= Date.now()) analyticsRows.delete(key);
    if (!(capture.kind === "VIEW" ? analytics.viewEnabled : analytics.downloadEnabled)) return;
    if (capture.kind === "DOWNLOAD") requireValue(actorContext.getStore()?.role === "SALES", 403, "FORBIDDEN", "仅记录可信销售下载");
    const key = analyticsKey(capture);
    if (analyticsRows.has(key)) return;
    const manifest = capture.kind === "VIEW" ? store.manifest(capture.productId, capture.materialId) : store.salesManifest(capture.productId, capture.materialId);
    requireValue(manifest.releaseId === capture.releaseId && manifest.versionId === capture.versionId, 409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
    const minute = Math.floor(Date.now() / 60000), rateKey = `${capture.sourceIp}:${minute}`;
    requireValue((analyticsRates.get(rateKey) ?? 0) < 60, 429, "RATE_LIMITED", "浏览记录提交过于频繁");
    analyticsRates.set(rateKey, (analyticsRates.get(rateKey) ?? 0) + 1);
    for (const old of analyticsRates.keys()) if (!old.endsWith(`:${minute}`)) analyticsRates.delete(old);
    const internalId = store.resolvePublicId(capture.productId), product = store.current(internalId);
    analyticsRows.set(key, analyticsRecord({ ...capture, actorName: capture.kind === "DOWNLOAD" ? actorContext.getStore()?.displayName : undefined }, { productId: internalId, productName: product.content.name, materialName: manifest.name, versionLabel: manifest.versionLabel }));
  };
  const feedback: import("@zj/contracts").Responses["FeedbackItem"][] = [];
  const feedbackRates = new Map<string, number>();
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
            : env.ENABLE_MOCK_ROLES === "true" && header === "Bearer local-sales"
              ? "mock-sales"
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
    materialVersions: bind("materialVersions"),
    create: bind("create"),
    save: bind("save"),
    publish: bind("publish"),
    unpublish: bind("unpublish"),
    removeProduct: bind("removeProduct"),
    restoreProduct: bind("restoreProduct"),
    assertProductWritable: bind("assertProductWritable"),
    assertProductReadable: bind("assertProductReadable"),
    createUpload: bind("createUpload"),
    publicCategories: bind("publicCategories"),
    publicProduct: bind("publicProduct"),
    resolvePublicId: bind("resolvePublicId"),
    manifest: bind("manifest"),
    previewAsset: bind("previewAsset"),
    mediaAsset: bind("mediaAsset"),
    salesProduct: bind("salesProduct"),
    salesManifest: bind("salesManifest"),
    salesPreviewAsset: bind("salesPreviewAsset"),
    salesSourceAsset: bind("salesSourceAsset"),
    siteBanner: () => structuredClone(normalizeSiteBanner(banner as typeof banner & Record<string, unknown>)),
    siteContact: () => structuredClone(contact),
    submitFeedback(body, ip) {
      const data = validateFeedback(body), hour = Math.floor(Date.now() / 3600000), key = `${ip}:${hour}`;
      requireValue((feedbackRates.get(key) ?? 0) < 5, 429, "RATE_LIMITED", "提交过于频繁，请稍后再试");
      feedbackRates.set(key, (feedbackRates.get(key) ?? 0) + 1);
      for (const old of feedbackRates.keys()) if (!old.endsWith(`:${hour}`)) feedbackRates.delete(old);
      feedback.push({ feedbackId: randomUUID(), content: data.content, contact: data.contact, createdAt: new Date().toISOString() });
    },
    listFeedback() {
      requireValue(actorContext.getStore()?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可查看反馈");
      return structuredClone(feedback).reverse();
    },
    async writeSiteContact(body, requestId) {
      const actor = actorContext.getStore();
      requireValue(actor?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护联系方式");
      const data = await validateSiteContact(body);
      requireValue(data.expectedVersion === contact.version, 409, "VERSION_CONFLICT", "联系方式已被修改，请重新读取");
      contact = { version: contact.version + 1, officialQr: data.officialQr, serviceQr: data.serviceQr, phone: data.phone };
      store.events.push({ eventId: randomUUID(), actorId: actor.userId, actorName: actor.displayName, action: "UPDATE_SITE_CONTACT", targetId: "site-contact", requestId, createdAt: new Date().toISOString(), draftVersion: null, publicationVersion: null, releaseSequence: null });
      return structuredClone(contact);
    },
    async writeSiteBanner(body, requestId) {
      const actor = actorContext.getStore();
      requireValue(actor?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护 Banner");
      const data = await validateSiteBanner(body);
      requireValue(data.expectedVersion === banner.version, 409, "VERSION_CONFLICT", "Banner 已被修改，请重新读取");
      banner = { version: banner.version + 1, ...bannerFields(data, banner) };
      store.events.push({ eventId: randomUUID(), actorId: actor.userId, actorName: actor.displayName, action: "UPDATE_SITE_BANNER", targetId: "site-banner", requestId, createdAt: new Date().toISOString(), draftVersion: null, publicationVersion: null, releaseSequence: null });
      return structuredClone(banner);
    },
    analyticsSettings: () => structuredClone(analytics),
    writeAnalyticsSettings(body, requestId) {
      const actor = actorContext.getStore();
      requireValue(actor?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可维护统计设置");
      const data = validateAnalyticsSettings(body);
      requireValue(data.expectedVersion === analytics.version, 409, "VERSION_CONFLICT", "统计设置已修改，请重新读取");
      analytics = { ...analytics, version: analytics.version + 1, viewEnabled: data.viewEnabled, downloadEnabled: data.downloadEnabled, dashboardEnabled: data.dashboardEnabled };
      store.events.push({ eventId: randomUUID(), actorId: actor.userId, actorName: actor.displayName, action: "UPDATE_ANALYTICS_SETTINGS", targetId: "analytics", requestId, createdAt: new Date().toISOString(), draftVersion: null, publicationVersion: null, releaseSequence: null });
      return structuredClone(analytics);
    },
    captureAnalytics,
    submitAnalyticsView(body, ip) {
      const data = validateAnalyticsView(body);
      captureAnalytics({ ...data, kind: "VIEW", eventKey: data.viewId, sourceIp: ip });
    },
    analyticsEvents() {
      requireValue(actorContext.getStore()?.role === "ADMIN", 403, "FORBIDDEN", "仅管理员可查看统计记录");
      for (const [key, row] of analyticsRows) if (row.expiresAt.getTime() <= Date.now()) analyticsRows.delete(key);
      return recentAnalytics([...analyticsRows.values()]);
    },
    uploadResult: (id) => { const upload = store.assets.get(id); store.assertProductReadable(upload.productId); return store.assets.result(upload); },
    put: async (id, req) => { const productId = store.assets.get(id).productId; store.assertProductWritable(productId); const result = await store.assets.put(id, req); store.assertProductWritable(productId); return result; },
    complete: async (id) => { const productId = store.assets.get(id).productId; store.assertProductWritable(productId); const result = await store.assets.complete(id); store.assertProductWritable(productId); return result; },
    bytes: async (id, asset, original) => { store.assertProductReadable(id); return store.assets.bytes(id, asset, original); },
  };
}
