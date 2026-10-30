import { test, expect } from "@playwright/test";
import { mockRetainedApp } from "./helpers/retained-app.js";

test("vào ứng dụng mở thẳng Công việc và không còn menu Trang chủ", async ({ page }) => {
  await mockRetainedApp(page);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto("/");
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole("heading", { name: "Công việc", exact: true })).toBeVisible();
    await expect(page).toHaveTitle("Công việc · HTS");
    await expect(page.getByRole("button", { name: "Trang chủ", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test("tài khoản cần đổi mật khẩu vẫn phải đổi trước khi vào Công việc", async ({ page }) => {
  await mockRetainedApp(page, { user: { mustChangePassword: true } });
  await page.goto("/");
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByRole("button", { name: "Đổi mật khẩu", exact: true })).toBeVisible();
});
