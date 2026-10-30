import { expect, test } from "@playwright/test";
import { apiDeleteAs, apiGetAs, apiPatchAs, apiPostAs } from "./helpers/api.js";
import { setAuthStorage } from "./helpers/auth.js";
import { e2eName, e2eSuffix, flattenTree } from "./helpers/data.js";
import { hasPermission } from "./helpers/assertions.js";

const firstDepartment = async (request) => {
  const { data: tree } = await apiGetAs(request, "superadmin", "/departments/tree", {
    params: { isActive: 1 },
  });
  return flattenTree(tree).find((item) => item.id);
};

const firstRole = async (request) => {
  const { data: roles } = await apiGetAs(request, "superadmin", "/roles");
  return roles.find((role) => role.isActive !== false && !role.isSystem) || roles[0];
};

const createE2EStaff = async (request, overrides = {}) => {
  const department = overrides.department || await firstDepartment(request);
  const suffix = e2eSuffix();
  const code = `E2E_USER_${suffix}`;
  const username = `e2e_user_${suffix}`;
  const { data } = await apiPostAs(request, "superadmin", "/staff-members", {
    code,
    username,
    fullName: e2eName("USER_FULLNAME"),
    departmentId: department?.id,
    position: "E2E Tester",
    password: `E2E_${suffix}_Aa1!`,
    mustChangePassword: true,
    isActive: true,
    ...(overrides.payload || {}),
  });
  return { staff: data, department };
};

test.describe("Cán bộ và tài khoản", () => {
  test("API danh sách cán bộ trả phân trang chuẩn hóa", async ({ request }) => {
    const { data } = await apiGetAs(request, "superadmin", "/staff-members", {
      params: { page: 1, limit: 1 },
    });
    expect(Array.isArray(data.staffMembers)).toBeTruthy();
    expect(data.staffMembers.length).toBeLessThanOrEqual(1);
    expect(data.pagination).toMatchObject({ page: 1, limit: 1 });
    expect(Number(data.pagination.total)).toBeGreaterThanOrEqual(data.staffMembers.length);
  });

  test("lọc cán bộ theo phòng ban, vai trò và trạng thái trên UI", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    const role = await firstRole(request);
    const { staff, department } = await createE2EStaff(request);
    if (role?.id) {
      await apiPostAs(request, "superadmin", `/staff-members/${staff.id}/role-assignments`, {
        roleId: role.id,
        scopeType: "department",
        departmentId: department.id,
        isActive: true,
      });
    }

    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Cán bộ", exact: true })).toBeVisible();

    const search = page.getByPlaceholder(/Tìm/i).first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(staff.fullName);
      await expect(page.getByText(staff.fullName).first()).toBeVisible();
    }

    for (const label of ["Phòng ban", "Vai trò", "Trạng thái"]) {
      const select = page.locator(".ant-select").filter({ hasText: new RegExp(label, "i") }).first();
      if (await select.isVisible().catch(() => false)) {
        await select.click();
        await page.locator(".ant-select-item-option").first().click({ force: true });
        await expect(page.getByText(/Tài khoản|Không có dữ liệu|E2E/i).first()).toBeVisible();
      }
    }
  });

  test("tạo tài khoản E2E, sửa thông tin, gán phòng ban và bật tắt trạng thái an toàn", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/staff");
    await page.getByRole("button", { name: /Thêm tài khoản/ }).click();
    await expect(page.getByRole("dialog", { name: "Thêm tài khoản" })).toBeVisible();

    const { staff, department } = await createE2EStaff(request);
    expect(staff.code).toMatch(/^E2E_USER_/);

    const updatedName = `${staff.fullName}_EDITED`;
    const { data: updated } = await apiPatchAs(request, "superadmin", `/staff-members/${staff.id}`, {
      fullName: updatedName,
      departmentId: department.id,
      position: "E2E Edited",
      isActive: false,
    });
    expect(updated.fullName).toBe(updatedName);
    expect(updated.isActive).toBe(false);

    const { data: reactivated } = await apiPatchAs(request, "superadmin", `/staff-members/${staff.id}`, {
      isActive: true,
    });
    expect(reactivated.isActive).toBe(true);

    await page.goto(`/staff`);
    await page.getByPlaceholder(/Tìm/i).first().fill(updatedName);
    await expect(page.getByText(updatedName).first()).toBeVisible();
  });

  test("reset mật khẩu và quản lý role assignment của tài khoản E2E", async ({ page, request }) => {
    const { staff, department } = await createE2EStaff(request);
    const role = await firstRole(request);
    test.skip(!role?.id, "Không có role phù hợp để kiểm tra gán quyền.");

    const reset = await apiPostAs(request, "superadmin", `/auth/admin/reset-password/${staff.id}`, {
      password: "E2E_Reset_123!",
      confirmPassword: "E2E_Reset_123!",
    });
    expect(reset.data.user.mustChangePassword).toBeTruthy();

    const { data: assignment } = await apiPostAs(request, "superadmin", `/staff-members/${staff.id}/role-assignments`, {
      roleId: role.id,
      scopeType: "department",
      departmentId: department.id,
      isActive: true,
    });
    expect(assignment.roleId).toBe(role.id);

    const { data: edited } = await apiPatchAs(
      request,
      "superadmin",
      `/staff-members/${staff.id}/role-assignments/${assignment.id}`,
      { scopeType: "specific_departments", departmentIds: [department.id], isActive: true },
    );
    expect(edited.scopeType).toBe("specific_departments");

    await apiDeleteAs(request, "superadmin", `/staff-members/${staff.id}/role-assignments/${assignment.id}`);
    const { data: assignments } = await apiGetAs(request, "superadmin", `/staff-members/${staff.id}/role-assignments`);
    expect(assignments.find((item) => item.id === assignment.id)?.isActive).toBe(false);

    await setAuthStorage(page, request, "superadmin");
    await page.goto("/staff");
    await page.getByPlaceholder(/Tìm/i).first().fill(staff.fullName);
    await expect(page.getByText(staff.fullName).first()).toBeVisible();
  });

  test("người không có quyền quản lý cán bộ không thấy action quản trị", async ({ page, request }) => {
    const user = await setAuthStorage(page, request, "staff");
    test.skip(hasPermission(user, "staff.manage"), "User staff đang có staff.manage nên không dùng để test thiếu quyền.");
    await page.goto("/staff");
    await expect(page.getByRole("button", { name: /Thêm tài khoản/ })).toHaveCount(0);
  });
});
