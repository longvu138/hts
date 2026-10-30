import { mockRetainedApp } from "./retained-app.js";

export const mockManagementApp = async (page) => {
  await mockRetainedApp(page);
  const state = {
    failure: null,
    writes: [],
    staff: [{ id: "E2E_USER_staff", code: "E2E_USER_1", fullName: "E2E Cán bộ", username: "e2e_staff", departmentId: "E2E_DEPT_1", isActive: true, mustChangePassword: false, roleAssignments: [] }],
    departments: [{ id: "E2E_DEPT_1", code: "E2E_DEPT_1", name: "E2E Phòng kỹ thuật", type: "phong", isActive: true, children: [] }],
    roles: [
      { id: "E2E_ROLE_admin", name: "superadmin", label: "E2E Quản trị", level: 100, isSystem: true, isActive: true },
      { id: "E2E_ROLE_staff", name: "e2e_role_staff", label: "E2E Chuyên viên", level: 10, isSystem: false, isActive: true },
    ],
  };
  const actions = ["department.view", "department.manage", "staff.view", "staff.manage", "system.manage"].map((name, index) => ({ name, label: name, groupName: name.split(".")[0], isActive: true, sortOrder: index }));
  const matrix = { E2E_ROLE_admin: ["system.manage"], E2E_ROLE_staff: ["staff.view"] };
  await page.route((url) => /^\/api\/(staff-members|departments|roles|auth\/admin\/(users|reset-password))/.test(url.pathname), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const method = request.method();
    if (state.failure && path === state.failure) return route.fulfill({ status: 503, json: { message: "E2E Không tải được dữ liệu" } });
    let body;
    if (method !== "GET") {
      const data = request.postDataJSON() || {};
      state.writes.push({ method, path, data });
      if (path === "/staff-members" && method === "POST") {
        body = { ...data, id: "E2E_USER_created", isActive: true, roleAssignments: [] };
        state.staff.push(body);
      } else if (/^\/staff-members\/[^/]+$/.test(path)) {
        const member = state.staff.find((item) => path.endsWith(item.id));
        Object.assign(member, data);
        body = member;
      } else if (path === "/roles" && method === "POST") {
        body = { ...data, id: "E2E_ROLE_created", isActive: true, isSystem: false };
        state.roles.push(body);
      } else if (path.endsWith("/permissions")) {
        const id = path.split("/")[2];
        matrix[id] = data.actions;
        body = data.actions;
      } else body = { success: true };
      return route.fulfill({ status: method === "POST" ? 201 : 200, json: body });
    }
    if (path === '/staff-members/assignment-options') body = state.assignmentOptions || { roles: state.roles, scopes: ['system', 'department', 'department_tree', 'specific_departments'].map(value => ({ value, label: { system: 'Toàn hệ thống', department: 'Một đơn vị', department_tree: 'Đơn vị và cấp dưới', specific_departments: 'Các đơn vị được chọn' }[value], departmentIds: value === 'system' ? [] : state.departments.map(d => d.id) })), departments: state.departments, canAssignToSelf: true };
    else if (path.startsWith("/departments")) body = state.departments;
    else if (path === "/staff-members") body = { staffMembers: state.staff, pagination: { page: 1, limit: 25, total: state.staff.length, totalPages: 1 } };
    else if (path.endsWith("/role-assignments")) body = [];
    else if (path.endsWith("/sessions")) body = [{ id: "E2E_session", browser: "Chrome", operatingSystem: "Linux", deviceType: "desktop", ipAddress: "127.0.0.1", active: true, createdAt: "2026-10-24T00:00:00Z", lastSeenAt: "2026-10-24T00:00:00Z" }];
    else if (path === "/roles/actions") body = actions;
    else if (path === "/roles/permissions-matrix") body = matrix;
    else if (path === "/roles") body = state.roles;
    else throw new Error(`API quản trị chưa được mock: ${method} ${path}`);
    return route.fulfill({ json: body });
  });
  return state;
};
