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
