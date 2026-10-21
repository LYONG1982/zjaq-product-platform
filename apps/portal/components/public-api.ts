import { createClient } from "@zj/api-client";
export const api = () =>
  createClient(
    process.env.PORTAL_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1",
  );
export const mediaUrl = (path: string) =>
  "/api/catalog/" + path.replace(/^\/api\/v1\/catalog\//, "");
export const viewerUrl = (productId: string, materialId: string) =>
  "/viewer?productId=" +
  encodeURIComponent(productId) +
  "&materialId=" +
  encodeURIComponent(materialId);
