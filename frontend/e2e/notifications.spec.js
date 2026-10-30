import { test, expect } from "@playwright/test";
import { mockRetainedApp } from "./helpers/retained-app.js";

test("chuông thông báo còn hoạt động và thông báo lịch sử quay về công việc", async ({ page }) => {
  const calls = await mockRetainedApp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await expect(page.getByText("Thông báo trình duyệt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mở thông báo: E2E Thông báo lịch sử" }).click();
  await expect(page).toHaveURL(/\/work$/);
  await expect.poll(() => calls.some((path) => path.endsWith("/read"))).toBeTruthy();
});
