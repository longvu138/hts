import { test, expect } from "@playwright/test";
import { mockRetainedApp } from "./helpers/retained-app.js";

const isMobile = (page) => (page.viewportSize()?.width || 0) < 768;

const openAccountSheet = async (page) => {
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Tài khoản", exact: true }).click();
  return page.getByRole("dialog", { name: "Tài khoản của tôi" });
};

test("đường dẫn không tồn tại trở về công việc", async ({ page }) => {
  await mockRetainedApp(page);
  await page.goto("/duong-dan-khong-ton-tai");
  await expect(page).toHaveURL(/\/work$/);
  await expect(page.getByRole("heading", { name: "Công việc" })).toBeVisible();
});

test("người không có quyền quản trị bị chặn khỏi danh mục và vai trò", async ({ page }) => {
  await mockRetainedApp(page, { permissions: [] });
  for (const path of ["/departments", "/staff", "/system/roles"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole("heading", { name: "Công việc" })).toBeVisible();
  }
});

test("menu quản trị còn truy cập được trên desktop và mobile, dùng nhãn Cán bộ", async ({ page }) => {
  await mockRetainedApp(page);
  await page.goto("/");
  if (isMobile(page)) {
    const nav = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(nav.getByRole("button", { name: "Phòng ban", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Cán bộ", exact: true })).toBeVisible();
    const sheet = await openAccountSheet(page);
    await expect(sheet.getByRole("button", { name: "Vai trò & Quyền", exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Đổi mật khẩu", exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Quản lý tài khoản/ })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Vai trò & Quyền", exact: true }).click();
    await expect(page).toHaveURL(/\/system\/roles$/);
    await page.goto("/");
    await nav.getByRole("button", { name: "Phòng ban", exact: true }).click();
  } else {
    await expect(page.getByRole("button", { name: "Phòng ban", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cán bộ", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tài khoản", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Phòng ban", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/departments$/);
  await expect(page).toHaveTitle("Phòng ban · HTS");
});

for (const [permission, path, label] of [["staff.manage", "/staff", "Cán bộ"], ["department.manage", "/departments", "Phòng ban"]]) {
  test(`chỉ có ${permission} vẫn thấy menu ${label} giống quyền vào route`, async ({ page }) => {
    await mockRetainedApp(page, { permissions: [permission] });
    await page.goto("/");
    const scope = isMobile(page) ? page.getByRole("navigation", { name: "Điều hướng chính" }) : page.getByRole("navigation", { name: "Menu chính" });
    await scope.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });
}

test("thành viên thường không thấy menu quản trị; tiêu đề là tên ứng dụng", async ({ page }) => {
  await mockRetainedApp(page, { permissions: [] });
  await page.goto("/");
  await expect(page.getByText("Quản trị hệ thống", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^HTS/ })).toBeVisible();
  for (const label of ["Phòng ban", "Cán bộ", "Vai trò & Quyền"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }
  if (isMobile(page)) {
    const sheet = await openAccountSheet(page);
    await expect(sheet.getByRole("button", { name: "Vai trò & Quyền" })).toHaveCount(0);
    await expect(sheet.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  }
});

test("tiêu đề tab theo từng trang", async ({ page }) => {
  await mockRetainedApp(page);
  for (const [path, title] of [["/", "Công việc · HTS"], ["/staff", "Cán bộ · HTS"], ["/system/roles", "Vai trò & Quyền · HTS"], ["/change-password", "Đổi mật khẩu · HTS"]]) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  }
});
