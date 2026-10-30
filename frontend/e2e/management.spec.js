import { test, expect } from "@playwright/test";
import { mockManagementApp } from "./helpers/management-app.js";

const pages = [
  { path: "/staff", heading: "Cán bộ", target: "E2E Cán bộ", api: "/staff-members" },
  { path: "/departments", heading: "Phòng ban", target: "E2E Phòng kỹ thuật", api: "/departments/tree" },
  { path: "/system/roles", heading: "Vai trò & Quyền", target: "E2E Chuyên viên", api: "/roles/actions" },
];

for (const width of [390, 768, 1024, 1440]) {
  test(`các màn quản trị sau refactor hiển thị ở ${width}px không tràn ngang`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    await mockManagementApp(page);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const item of pages) {
      await page.goto(item.path);
      await expect(page.getByRole("heading", { name: item.heading, exact: true })).toBeVisible();
      await expect(page.getByText(item.target, { exact: true }).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      // Vùng nội dung bên trong cũng không được tràn ngang (bảng tự cuộn trong khung của nó).
      expect(await page.locator(".resource-page").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
      await page.screenshot({ path: test.info().outputPath(`management-${width}-${item.path.replaceAll("/", "_")}.png`), fullPage: true, animations: "disabled" });
    }
    expect(errors).toEqual([]);
  });
}

for (const item of pages) {
  test(`${item.heading}: lỗi tải có thông báo và thử lại khôi phục dữ liệu`, async ({ page }) => {
    const state = await mockManagementApp(page);
    state.failure = item.api;
    await page.goto(item.path);
    await expect(page.getByRole("alert")).toBeVisible();
    state.failure = null;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByText(item.target, { exact: true }).first()).toBeVisible();
  });
}

test("form tài khoản, vai trò và phiên đăng nhập còn hoạt động sau khi tách component", async ({ page }) => {
  const state = await mockManagementApp(page);
  await page.goto("/staff");
  await page.getByRole("button", { name: /Thêm tài khoản/ }).click();
  const create = page.getByRole("dialog", { name: "Thêm tài khoản", exact: true });
  await create.getByLabel("Họ tên", { exact: true }).fill("E2E Cán bộ mới");
  await create.getByLabel("Tài khoản đăng nhập", { exact: true }).fill("e2e_created");
  // "Gán vai trò ngay" mặc định tắt: tạo hồ sơ không cần chọn vai trò.
  await expect(create.getByRole("switch", { name: "Gán vai trò ngay" })).not.toBeChecked();
  await create.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(create).toHaveCount(0);
  await expect(page.getByText("E2E Cán bộ mới", { exact: true })).toBeVisible();
  expect(state.writes.some((item) => item.path === "/staff-members" && item.method === "POST")).toBeTruthy();

  await page.getByRole("button", { name: /^Thao tác khác cho / }).first().click();
  await page.getByRole("menuitem", { name: /Phiên đăng nhập/ }).click();
  await expect(page.getByRole("dialog").getByText("Chrome", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Đóng", exact: true }).click();
  await page.goto("/system/roles");
  await page.getByRole("button", { name: /Thêm vai trò/ }).click();
  const role = page.getByRole("dialog", { name: "Thêm vai trò mới", exact: true });
  await role.getByPlaceholder("vd: tro_ly_cvp").fill("e2e_role_created");
  await role.getByLabel("Tên hiển thị", { exact: true }).fill("E2E Vai trò mới");
  await role.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(role).toHaveCount(0);
  await expect(page.getByText("E2E Vai trò mới", { exact: true }).first()).toBeVisible();
});

test("tab vai trò và drawer phân quyền không vỡ bố cục trên màn hình hiện tại", async ({ page }) => {
  await mockManagementApp(page);
  await page.goto("/staff");
  if ((page.viewportSize()?.width || 0) < 1200) await page.getByText("E2E Cán bộ", { exact: true }).click();
  else await page.getByRole("button", { name: "Sửa", exact: true }).first().click();
  const account = page.getByRole("dialog", { name: "Sửa tài khoản", exact: true });
  await account.getByRole("tab", { name: "Vai trò & phạm vi" }).click();
  await expect(account.getByRole("button", { name: /Gán$/ })).toBeVisible();
  expect(await account.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  const roleControl = await account.locator(".ant-tabs-tabpane-active .ant-select").first().boundingBox();
  expect(roleControl).not.toBeNull();
  expect(roleControl.width).toBeGreaterThanOrEqual(130);
  await page.screenshot({ path: test.info().outputPath("staff-role-panel.png"), fullPage: true, animations: "disabled" });
  await account.getByRole("button", { name: "Hủy bỏ", exact: true }).click();
  await page.goto("/system/roles");
  await page.getByRole("button", { name: /Phân quyền/ }).first().click();
  const permissions = page.getByRole("dialog", { name: /Phân quyền cho vai trò/ });
  await expect(permissions.getByRole("button", { name: "Lưu thay đổi", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: test.info().outputPath("role-permissions-drawer.png"), fullPage: true, animations: "disabled" });
});

test('modal tài khoản dùng chung giữ header và footer khi form dài trên màn hình thấp', async ({ page }) => {
  await mockManagementApp(page);
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 600 }); await page.goto('/staff');
    await page.getByRole('button', { name: /Thêm tài khoản/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCSS('transform', 'none');
    const box = await dialog.boundingBox(); expect(box.y).toBeGreaterThanOrEqual(8); expect(box.y + box.height).toBeLessThanOrEqual(592);
    await expect(dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true })).toBeInViewport();
    await dialog.locator('.ant-modal-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
    await expect(dialog.getByRole('button', { name: 'Tạo tài khoản', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
  }
});

for (const width of [390, 768, 1440]) test(`form tài khoản bố trí cột phù hợp ở ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 960 }); await mockManagementApp(page); await page.goto('/staff');
  await page.getByRole('button', { name: /Thêm tài khoản/ }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toHaveCSS('transform', 'none');
  const name = await dialog.getByLabel('Họ tên', { exact: true }).boundingBox();
  await expect(dialog.getByLabel('Mã tài khoản', { exact: true })).toHaveCount(0);
  const username = await dialog.getByLabel('Tài khoản đăng nhập', { exact: true }).boundingBox();
  if (width < 576) { expect(username.y).toBeGreaterThan(name.y); expect(Math.abs(name.x - username.x)).toBeLessThan(2); }
  else expect(Math.abs(name.y - username.y)).toBeLessThan(2);
  await expect(dialog.getByLabel('Email', { exact: true })).toBeHidden();
  await dialog.getByText('Thông tin thêm (không bắt buộc)', { exact: true }).click();
  await expect(dialog.getByLabel('Email', { exact: true })).toBeVisible();
  await dialog.screenshot({ path: test.info().outputPath(`staff-form-${width}.png`) });
});
test('gán vai trò chỉ đưa ra lựa chọn do backend cho phép', async ({ page }) => {
  const state = await mockManagementApp(page);
  state.assignmentOptions = { roles: [state.roles[1]], scopes: [{ value: 'department', label: 'Một đơn vị', departmentIds: [state.departments[0].id] }], departments: state.departments, canAssignToSelf: false };
  await page.goto('/staff'); await page.getByRole('button', { name: /Thêm tài khoản/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('switch', { name: 'Gán vai trò ngay' }).click();
  await dialog.getByRole('combobox', { name: 'Vai trò', exact: true }).click();
  await expect(page.getByText('E2E Chuyên viên', { exact: true }).last()).toBeVisible();
  await expect(page.locator('.ant-select-dropdown:visible').getByText('E2E Quản trị', { exact: true })).not.toBeVisible();
  await page.keyboard.press('Escape');
  await dialog.getByRole('combobox', { name: 'Phạm vi', exact: true }).click();
  await expect(page.getByText('Toàn hệ thống', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Đơn vị và cấp dưới', { exact: true })).toHaveCount(0);
});

test("trưởng phòng tạo tài khoản được điền phòng ban và bắt buộc tên đăng nhập", async ({ page }, testInfo) => {
  if (testInfo.project.name === "desktop") await page.setViewportSize({ width: 768, height: 960 });
  const state = await mockManagementApp(page);
  state.departments.push({ id: "E2E_DEPT_other", name: "E2E Phòng khác", isActive: true });
  state.assignmentOptions = { roles: [state.roles[1]], scopes: [{ value: "department", label: "Một đơn vị", departmentIds: ["E2E_DEPT_1"] }], departments: [state.departments[0]], canAssignToSelf: false };
  await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "E2E_USER_head", username: "e2e_head", name: "E2E Trưởng phòng", departmentId: "E2E_DEPT_1", permissions: ["staff.view", "staff.manage", "department.view"] } } }));
  await page.goto("/staff");
  await page.getByRole("button", { name: /Thêm tài khoản/ }).click();
  const dialog = page.getByRole("dialog", { name: "Thêm tài khoản", exact: true });
  const department = dialog.locator('.ant-form-item').filter({ has: page.locator('label').filter({ hasText: /^Phòng ban$/ }) });
  await expect(department).toContainText("E2E Phòng kỹ thuật");
  await dialog.getByLabel("Phòng ban", { exact: true }).click();
  await expect(page.getByRole("option", { name: "E2E Phòng khác" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByLabel("Họ tên", { exact: true }).fill("E2E Tài khoản trong phòng");
  await dialog.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(dialog.getByText("Vui lòng nhập tên đăng nhập", { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await dialog.getByLabel("Tài khoản đăng nhập", { exact: true }).fill("e2e_new_member");
  await dialog.getByRole("button", { name: "Tạo tài khoản", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes[0].data).toMatchObject({ username: "e2e_new_member", departmentId: "E2E_DEPT_1" });
});

for (const width of [390, 768, 1440]) test(`nút thao tác thống nhất kích thước ở ${width}px`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Các viewport được kiểm tra trong project desktop');
  await page.setViewportSize({ width, height: 960 });
  await mockManagementApp(page);
  const expected = width <= 1024 ? 44 : 36;
  const assertButtons = async (root) => {
    await expect.poll(async () => {
      const sizes = await root.locator('.ant-btn:visible').evaluateAll(buttons => buttons.map(button => ({
        label: button.getAttribute('aria-label') || button.textContent.trim(),
        height: Math.round(button.getBoundingClientRect().height),
        font: getComputedStyle(button).fontSize,
      })));
      return sizes.filter(button => button.height !== expected || button.font !== '14px');
    }).toEqual([]);
  };
  for (const path of ['/work', '/staff', '/departments', '/system/roles']) {
    await page.goto(path);
    await expect(page.locator('.resource-page')).toBeVisible();
    await expect(page.locator('.resource-page .ant-btn:visible').first()).toBeVisible();
    await assertButtons(page.locator('.resource-page'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    if (path === '/work') {
      await page.getByRole('button', { name: 'Giao việc', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Giao việc', exact: true });
      await expect(editor).toBeVisible();
      await assertButtons(editor);
      await page.screenshot({ path: testInfo.outputPath(`buttons-work-${width}.png`), animations: 'disabled' });
      await editor.locator('.ant-modal-close').click();
    }
    if (path === '/staff') {
      await page.getByRole('button', { name: /Thêm tài khoản/ }).click();
      const account = page.getByRole('dialog', { name: 'Thêm tài khoản', exact: true });
      await expect(account).toBeVisible();
      await assertButtons(account);
      await account.getByRole('button', { name: 'Hủy bỏ', exact: true }).click();
    }
  }
});

test("hàng cán bộ gom thao tác phụ vào menu và đặt lại mật khẩu bằng mật khẩu ngẫu nhiên", async ({ page }) => {
  const state = await mockManagementApp(page);
  await page.goto("/staff");
  await expect(page.getByText("Đã đổi", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Đặt lại mật khẩu" })).toHaveCount(0);
  await page.getByRole("button", { name: "Thao tác khác cho E2E Cán bộ", exact: true }).click();
  await page.getByRole("menuitem", { name: /Đặt lại mật khẩu/ }).click();
  const dialog = page.getByRole("dialog", { name: /Đặt lại mật khẩu/ });
  await dialog.getByRole("button", { name: /Tạo ngẫu nhiên/ }).click();
  const password = await dialog.getByLabel("Mật khẩu tạm", { exact: true }).inputValue();
  expect(password.length).toBeGreaterThanOrEqual(10);
  expect(password.toLowerCase()).not.toContain("e2e_staff");
  await expect(dialog.getByLabel("Nhập lại mật khẩu tạm", { exact: true })).toHaveValue(password);
  await expect(dialog.getByText(password, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Sao chép|copy/i })).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  await dialog.getByRole("button", { name: "Đồng ý", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes.find((item) => item.path.startsWith("/auth/admin/reset-password/"))?.data).toMatchObject({ password, confirmPassword: password });
});
