import { test as base, expect, type APIRequestContext } from "@playwright/test";
export { expect };
export const urls = {
  portal: process.env.TEST_PORTAL_URL ?? "http://127.0.0.1:3300",
  admin: process.env.TEST_ADMIN_URL ?? "http://127.0.0.1:3301",
  h5: process.env.TEST_H5_URL ?? "http://127.0.0.1:3302",
  api: process.env.TEST_API_URL ?? "http://127.0.0.1:3303",
};
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("http://127.0.0.1:3100/api/**", async (route) => {
      const response = await route.fetch({
        url: route.request().url().replace("http://127.0.0.1:3100", urls.api),
      });
      await route.fulfill({ response });
    });
    await page.route("http://127.0.0.1:3403/api/**", async (route) => {
      const response = await route.fetch({
        url: route.request().url().replace("http://127.0.0.1:3403", urls.api),
      });
      await route.fulfill({ response });
    });
    await use(page);
  },
});
export async function json(
  request: APIRequestContext,
  path: string,
  method = "GET",
  data?: unknown,
  key?: string,
) {
  const response = await request.fetch(urls.api + "/api/v1" + path, {
    method,
    headers: {
      Authorization: "Bearer local-mock",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    data,
  });
  return { status: response.status(), body: await response.json() };
}
export async function publicProductId(request: APIRequestContext, name: string, releaseId?: string) {
  const result = await json(request, "/catalog/products?q=" + encodeURIComponent(name));
  expect(result.status).toBe(200);
  const matches = result.body.data.filter((item: { name: string; releaseId: string }) => item.name === name && (!releaseId || item.releaseId === releaseId));
  expect(matches).toHaveLength(1);
  return matches[0].productId as string;
}

/** Explicit test-only login. Production does not enable this session flow. */
export async function loginSales(page: import("@playwright/test").Page) {
  const response = await page.request.post(urls.portal + "/api/sales/session", {
    headers: { Origin: urls.portal, "Content-Type": "application/json" }, data: { localValidation: true },
  });
  expect(response.status(), "local PC session should be enabled only on the isolated development server").toBe(200);
}
