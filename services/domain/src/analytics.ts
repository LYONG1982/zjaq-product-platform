import { createHash, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import { assertSchema } from "@zj/contracts/validation";
import type { Domain, Responses } from "@zj/contracts";
import { requireValue, validateBody } from "./errors";

export const ANALYTICS_RETENTION_MS = 90 * 86400000;
export const analyticsNotice = "为改进资料服务，启用统计时会记录资料、访问时间、使用端和来源 IP，最多保留 90 天，仅管理员可查看。不会根据匿名访问推断分享人。";
export const emptyAnalyticsSettings = (): Responses["AnalyticsSettings"] => ({ version: 0, dashboardEnabled: false, downloadEnabled: false, viewEnabled: false, retentionDays: 90, notice: analyticsNotice });
export const publicAnalyticsSettings = (settings: Responses["AnalyticsSettings"]): Responses["AnalyticsNotice"] => ({ downloadEnabled: settings.downloadEnabled, viewEnabled: settings.viewEnabled, retentionDays: 90, notice: analyticsNotice });
export function validateAnalyticsSettings(body: unknown) {
  return validateBody<Domain["AnalyticsSettingsWrite"]>("AnalyticsSettingsWrite", body);
}
export function validateAnalyticsView(body: unknown) {
  return validateBody<Domain["AnalyticsViewSubmit"]>("AnalyticsViewSubmit", body);
}
export type AnalyticsCapture = {
  kind: "DOWNLOAD" | "VIEW";
  productId: string;
  materialId: string;
  releaseId: string;
  versionId: string;
  client: "SALES_PC" | "WECHAT" | "H5";
  eventKey: string;
  sourceIp: string;
  actorName?: string;
};
export type StoredAnalyticsEvent = Responses["AnalyticsEvent"] & { expiresAt: Date };
export function analyticsKey(capture: AnalyticsCapture) {
  return createHash("sha256").update(JSON.stringify([capture.kind, capture.productId, capture.materialId, capture.versionId, capture.sourceIp, capture.eventKey])).digest("hex");
}
export function analyticsRecord(capture: AnalyticsCapture, details: { productId: string; productName: string; materialName: string; versionLabel: string }, now = Date.now()): StoredAnalyticsEvent {
  return { eventId: randomUUID(), kind: capture.kind, ...details, materialId: capture.materialId, versionId: capture.versionId, occurredAt: new Date(now).toISOString(), client: capture.client, sourceIp: capture.sourceIp, sharer: null, actorName: capture.actorName ?? null, expiresAt: new Date(now + ANALYTICS_RETENTION_MS) };
}
export function recentAnalytics(rows: StoredAnalyticsEvent[], now = Date.now()): Responses["AnalyticsEvent"][] {
  return rows.filter((row) => Date.parse(row.occurredAt) > now - ANALYTICS_RETENTION_MS && Date.parse(row.occurredAt) <= now).map(({ expiresAt, ...row }) => row).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.eventId.localeCompare(b.eventId));
}
export function analyticsSummary(events: Responses["AnalyticsEvent"][]): Responses["AnalyticsSummary"] {
  const materials = new Map<string, Responses["AnalyticsMaterialSummary"]>();
  for (const event of events) {
    const key = event.productId + ":" + event.materialId;
    const row = materials.get(key) ?? { productId: event.productId, productName: event.productName, materialId: event.materialId, materialName: event.materialName, downloads: 0, views: 0 };
    if (event.kind === "DOWNLOAD") row.downloads++; else row.views++;
    materials.set(key, row);
  }
  return { retentionDays: 90, downloads: events.filter((e) => e.kind === "DOWNLOAD").length, views: events.filter((e) => e.kind === "VIEW").length, materials: [...materials.values()].sort((a, b) => b.views + b.downloads - a.views - a.downloads || a.materialId.localeCompare(b.materialId)) };
}
export function filterAnalytics(events: Responses["AnalyticsEvent"][], q: Record<string, string | number | boolean>) {
  for (const value of [q.from, q.to]) if (value) {
    const text = String(value), parsed = new Date(text + "T00:00:00Z");
    requireValue(/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text, 400, "INVALID_ARGUMENT", "统计日期无效");
  }
  const from = q.from ? Date.parse(String(q.from) + "T00:00:00+08:00") : -Infinity;
  const to = q.to ? Date.parse(String(q.to) + "T00:00:00+08:00") + 86400000 : Infinity;
  requireValue(!Number.isNaN(from) && !Number.isNaN(to) && from < to, 400, "INVALID_ARGUMENT", "统计日期范围无效");
  const term = String(q.q ?? "").toLocaleLowerCase();
  return events.filter((e) => (!q.kind || e.kind === q.kind) && (!q.client || e.client === q.client) && (!term || [e.productName, e.materialName].some((value) => value.toLocaleLowerCase().includes(term))) && Date.parse(e.occurredAt) >= from && Date.parse(e.occurredAt) < to);
}
function canonicalIp(value: string) {
  const text = value.trim();
  if (text.startsWith("::ffff:") && isIP(text.slice(7)) === 4) return text.slice(7);
  return isIP(text) ? text : "";
}
/** Headers are ignored unless the immediate peer is explicitly trusted. Walk right to left and stop at the first untrusted hop. */
export function sourceIp(req: Pick<IncomingMessage, "headers" | "socket">, trustedProxyAddresses: string[] = []) {
  const peer = canonicalIp(req.socket.remoteAddress ?? ""), trusted = new Set(trustedProxyAddresses.map(canonicalIp).filter(Boolean));
  if (!trusted.has(peer)) return peer || "unknown";
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded !== "string" || forwarded.length > 2048) return peer || "unknown";
  const chain = forwarded.split(",").map(canonicalIp);
  if (!chain.length || chain.some((part) => !part)) return peer || "unknown";
  let result = peer;
  for (let i = chain.length - 1; i >= 0 && trusted.has(result); i--) result = chain[i];
  return result || "unknown";
}

/** Restore never renews the 90-day clock, and drops expired raw-IP history. */
export function restoreAnalyticsRecord(value: Record<string, unknown>, now = Date.now()) {
  const { _id, expiresAt, ...record } = value;
  assertSchema("response", "AnalyticsEvent", record);
  const occurred = Date.parse(String(record.occurredAt));
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(String(expiresAt));
  if (!Number.isFinite(occurred) || !Number.isFinite(expiry.getTime()) || expiry.getTime() !== occurred + ANALYTICS_RETENTION_MS) throw new Error("INVALID_ANALYTICS_RETENTION");
  if (expiry.getTime() <= now) return undefined;
  return { ...record, expiresAt: expiry };
}
