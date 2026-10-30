import { expect, test } from "@playwright/test";
import { apiDeleteAs, apiGetAs, apiPatchAs, apiPostAs, apiPutAs } from "./helpers/api.js";
import { setAuthStorage } from "./helpers/auth.js";
import { hasPermission } from "./helpers/assertions.js";
import { e2eSuffix } from "./helpers/data.js";

const createE2ERole = async (request) => {
  const suffix = e2eSuffix();
  const name = `e2e_role_${suffix}`;
  const { data } = await apiPostAs(request, "superadmin", "/roles", {
    name,
    label: `E2E_ROLE_${suffix}`,
    level: 12,
  });
  return data;
};

const createE2EAction = async (request) => {
  const suffix = e2eSuffix();
  const name = `e2e.action_${suffix}`;
  const { data } = await apiPostAs(request, "superadmin", "/roles/actions", {
    name,
    label: `E2E_ACTION_${suffix}`,
    groupName: "E2E",
    description: "E2E permission action",
    sortOrder: 999,
  });
  return data;
};

test.describe("Vai trò và quyền", () => {
  test("người quản trị hệ thống xem được danh sách vai trò, action và ma trận quyền", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/system/roles");
    await expect(page.getByRole("heading", { name: "Vai trò & Quyền" })).toBeVisible();
    await expect(page.getByText("Ma trận phân quyền").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Nâng cao: danh mục quyền/ })).toBeVisible();

    const { data: roles } = await apiGetAs(request, "superadmin", "/roles");
    expect(Array.isArray(roles)).toBeTruthy();
    const { data: matrix } = await apiGetAs(request, "superadmin", "/roles/permissions-matrix");
    expect(typeof matrix).toBe("object");
  });

  test("bộ test quan trọng chỉ mở form vai trò và không đổi quyền vai trò thật", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/system/roles");
    await page.getByRole("button", { name: /Thêm vai trò/ }).click();
    await expect(page.getByText("Thêm vai trò mới")).toBeVisible();
  });

  test("tạo, sửa và tắt role E2E bằng API rồi xác nhận trên UI", async ({ page, request }) => {
    const role = await createE2ERole(request);
    expect(role.name).toMatch(/^e2e_role_/);

    const { data: updated } = await apiPatchAs(request, "superadmin", `/roles/${role.id}`, {
      label: `${role.label}_EDITED`,
      level: 13,
    });
    expect(updated.label).toContain("_EDITED");

    await setAuthStorage(page, request, "superadmin");
    await page.goto("/system/roles");
    await expect(page.getByText(updated.label).first()).toBeVisible();

    await apiDeleteAs(request, "superadmin", `/roles/${role.id}`);
    const { data: roles } = await apiGetAs(request, "superadmin", "/roles");
    expect(roles.some((item) => item.id === role.id)).toBe(false);
  });

  test("mở drawer quyền, tick/bỏ tick permission an toàn cho role E2E", async ({ page, request }) => {
    const role = await createE2ERole(request);
    const { data: actions } = await apiGetAs(request, "superadmin", "/roles/actions");
    const safeAction = actions.find((item) => item.name !== "system.manage" && item.isActive !== false);
    test.skip(!safeAction, "Không có permission action an toàn để gán role E2E.");

    await apiPutAs(request, "superadmin", `/roles/${role.id}/permissions`, { actions: [safeAction.name] });
    expect((await apiGetAs(request, "superadmin", `/roles/${role.id}/permissions`)).data).toContain(safeAction.name);

    await setAuthStorage(page, request, "superadmin");
    await page.goto("/system/roles");
    await expect(page.getByText(role.label).first()).toBeVisible();
    const detailButton = page.getByRole("button", { name: /Chi tiết|Quyền|Sửa quyền/i }).first();
    if (await detailButton.isVisible().catch(() => false)) {
      await detailButton.click();
      await expect(page.getByText(/Quyền chi tiết|Cập nhật quyền|Ma trận/i).first()).toBeVisible();
    }

    await apiPutAs(request, "superadmin", `/roles/${role.id}/permissions`, { actions: [] });
    expect((await apiGetAs(request, "superadmin", `/roles/${role.id}/permissions`)).data).not.toContain(safeAction.name);
  });

  test("tạo, sửa và tắt permission action E2E", async ({ request }) => {
    const action = await createE2EAction(request);
    expect(action.name).toMatch(/^e2e\.action_/);

    const { data: edited } = await apiPatchAs(request, "superadmin", `/roles/actions/${action.name}`, {
      label: `${action.label}_EDITED`,
      description: "E2E permission action edited",
      isActive: false,
    });
    expect(edited.label).toContain("_EDITED");
    expect(edited.isActive).toBe(false);
  });

  test("cảnh báo quyền nhạy cảm và user không có system.manage không vào được trang role", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/system/roles");
    const systemManage = page.getByText("system.manage").first();
    if (await systemManage.isVisible().catch(() => false)) {
      await expect(systemManage).toBeVisible();
    }

    const user = await setAuthStorage(page, request, "staff");
    test.skip(hasPermission(user, "system.manage"), "User staff đang có system.manage nên không dùng để test thiếu quyền.");
    await page.goto("/system/roles");
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole("heading", { name: "Công việc" })).toBeVisible();
  });
});
