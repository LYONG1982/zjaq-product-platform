import { test, expect, urls } from "./support";
test("H5 feedback reaches the admin-only list as plain text", async ({ page, request }) => {
  const value = `【虚构测试反馈】${Date.now()} <img src=x onerror=alert(1)>`;
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(urls.h5);
  await page.getByRole("button", { name: "建议反馈", exact: true }).click();
  await page.locator(".feedback-form textarea").fill(value);
  await page.locator(".feedback-form input").fill("测试联系方式");
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByText("感谢反馈，我们已收到。")).toBeVisible();
  expect((await request.get(urls.api + "/api/v1/admin/feedback")).status()).toBe(401);
  const admin = await page.context().newPage(); await admin.goto(urls.admin);
  await admin.getByRole("button", { name: "建议反馈", exact: false }).click();
  await expect(admin.getByText(value, { exact: true })).toBeVisible();
  expect(await admin.locator(".feedback-text img").count()).toBe(0);
  await admin.close();
});
