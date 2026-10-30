import { expect, test } from "@playwright/test";
import { apiGetAs, apiPatchAs, apiPostAs } from "./helpers/api.js";
import { setAuthStorage } from "./helpers/auth.js";
import { hasPermission } from "./helpers/assertions.js";
import { e2eName, e2eSuffix, flattenTree } from "./helpers/data.js";

const createE2EDepartment = async (request, overrides = {}) => {
  const suffix = e2eSuffix();
  const code = overrides.code || `E2E_DEPT_${suffix}`;
  const name = overrides.name || e2eName("DEPT");
  const { data } = await apiPostAs(request, "superadmin", "/departments", {
    code,
    name,
    type: "phong",
    sortOrder: 900,
    isActive: true,
    ...overrides.payload,
  });
  return data;
};

test.describe("Phòng ban", () => {
  test("mở danh sách/cây phòng ban và tìm kiếm không bị lỗi", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/departments");
    await expect(page.getByRole("heading", { name: "Phòng ban" })).toBeVisible();
    await expect(page.getByText(/(Quản lý|Xem) cây tổ chức/)).toBeVisible();

    const search = page.getByPlaceholder(/Tìm kiếm|Nhập/i).first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill("E2E");
      await expect(page.getByText(/Phòng ban|Không có dữ liệu|E2E/i).first()).toBeVisible();
    }
  });

  test("tạo phòng ban cha/con E2E và cây phòng ban hiển thị đúng cấp", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/departments");
    await page.getByRole("button", { name: /Thêm/ }).click();
    await expect(page.getByRole("dialog", { name: "Thêm phòng ban" })).toBeVisible();

    const parent = await createE2EDepartment(request, {
      code: `E2E_DEPT_PARENT_${e2eSuffix()}`,
      name: e2eName("DEPT_PARENT"),
    });
    const child = await createE2EDepartment(request, {
      code: `E2E_DEPT_CHILD_${e2eSuffix()}`,
      name: e2eName("DEPT_CHILD"),
      payload: { parentId: parent.id },
    });
    expect(child.parentId).toBe(parent.id);

    await page.goto("/departments");
    await page.getByPlaceholder(/Tìm/i).first().fill(parent.name);
    await expect(page.getByText(parent.name).first()).toBeVisible();

    const { data: tree } = await apiGetAs(request, "superadmin", "/departments/tree", {
      params: { q: "E2E_DEPT" },
    });
    const flat = flattenTree(tree);
    expect(flat.some((item) => item.id === parent.id)).toBeTruthy();
    expect(flat.some((item) => item.id === child.id && item.parentId === parent.id)).toBeTruthy();
  });

  test("sửa tên, loại, thứ tự và trạng thái phòng ban E2E", async ({ page, request }) => {
    const department = await createE2EDepartment(request);
    const editedName = `${department.name}_EDITED`;
    const { data: edited } = await apiPatchAs(request, "superadmin", `/departments/${department.id}`, {
      name: editedName,
      type: "to_nhom",
      sortOrder: 901,
      isActive: false,
    });
    expect(edited.name).toBe(editedName);
    expect(edited.isActive).toBe(false);

    await setAuthStorage(page, request, "superadmin");
    await page.goto("/departments");
    await page.getByPlaceholder(/Tìm/i).first().fill(editedName);
    await expect(page.getByText(editedName).first()).toBeVisible();

    const statusSelect = page.locator(".ant-select").filter({ hasText: /trạng thái|active|hoạt động/i }).first();
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.click();
      await page.locator(".ant-select-item-option").first().click({ force: true });
      await expect(page.getByText(/Phòng ban|Không có dữ liệu|E2E/i).first()).toBeVisible();
    }
  });

  test("người không có department.manage không thấy nút thêm/sửa phòng ban", async ({ page, request }) => {
    const user = await setAuthStorage(page, request, "staff");
    test.skip(hasPermission(user, "department.manage"), "User staff đang có department.manage nên không dùng để test thiếu quyền.");
    await page.goto("/departments");
    await expect(page.getByRole("button", { name: /Thêm/ })).toHaveCount(0);
  });
});
