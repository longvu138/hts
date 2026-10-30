export const E2E_TODAY_WORK = [
  { id: "00000000-0000-4000-8000-000000000011", workId: "00000000-0000-4000-8000-000000000010", title: "E2E Họp giao ban đầu tuần", place: "Phòng họp A", startsAt: "2026-10-24T01:00:00Z", endsAt: "2026-10-24T02:30:00Z", status: "assigned" },
  { id: "00000000-0000-4000-8000-000000000021", workId: "00000000-0000-4000-8000-000000000020", title: "E2E Kiểm tra hồ sơ dự án có tiêu đề rất dài để thử cắt dòng trên màn hình nhỏ", place: "", startsAt: "2026-10-24T07:00:00Z", endsAt: "2026-10-24T09:00:00Z", status: "completed" },
];

export const mockRetainedApp = async (page, { permissions = ["system.manage"], failDepartments = false, nullData = false, work = E2E_TODAY_WORK, workTotal, failWork = false, user = {} } = {}) => {
  const calls = [];
  let unreadCount = 2;
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    calls.push(path);
    let body;
    if (path === "/auth/me") body = { user: { id: "E2E_USER_mock", username: "E2E_USER_mock", name: "E2E Quản trị", permissions, ...user } };
    else if (path === "/work-assignments" && failWork) return route.fulfill({ status: 500, headers: { "X-Request-Id": "E2E_REQ_work" }, json: { requestId: "E2E_REQ_work", message: "Internal error" } });
    else if (path === "/work-assignments") body = nullData ? null : { items: work, pagination: { page: 1, limit: 5, total: workTotal ?? work.length } };
    else if (path === "/work-schedule/departments") body = { items: [], pagination: { total: 0 } };
    else if (path === "/work-schedule") body = nullData ? null : { items: [{ id: "E2E_USER_mock", name: "E2E Quản trị", assignments: Array.isArray(work) ? work : [], canAssign: permissions.includes('work.assign') || permissions.includes('system.manage') }], pagination: { page: 1, limit: 20, total: 1 } };
    else if (path === '/work-assignments/recipients') body = { items: [], pagination: { total: 0 } };
    else if (path === '/work-assignments/availability') body = { conflicts: [], hasMore: false };
    else if (path.startsWith('/work-assignments/')) {
      const item = work.find(item => path === `/work-assignments/${item.workId}`);
      if (!item) return route.fulfill({ status: 403, json: { message: 'E2E Mã công việc không tồn tại' } });
      body = { items: [item], pagination: { total: 1 }, history: [] };
    }
    else if (path === '/staff-members/assignment-options') body = { roles: [], scopes: [], departments: [], canAssignToSelf: permissions.includes('system.manage') };
    else if (path === "/departments" && failDepartments) return route.fulfill({ status: 500, json: { message: "E2E Không tải được đơn vị" } });
    else if (path.startsWith("/departments")) body = nullData ? null : [{ id: "E2E_DEPT_1", code: "E2E_DEPT_1", name: "E2E Phòng kỹ thuật", isActive: true }];
    else if (path === "/staff-members") body = nullData ? null : { staffMembers: [], pagination: { page: 1, limit: 1, total: 7, totalPages: 7 } };
    else if (path === "/notifications/unread-count") body = { unreadCount };
    else if (path.endsWith("/read") || path.endsWith("/read-all")) { unreadCount = 0; body = { success: true }; }
    else if (path === "/notifications") body = { items: [{ id: "E2E_notification", title: "E2E Thông báo lịch sử", message: "Nội dung thông báo", entityType: "task", entityId: "retired", createdAt: "2026-10-24T00:00:00Z" }], pagination: { total: 1 } };
    else if (path.includes("permissions-matrix")) body = {};
    else if (path.startsWith("/roles")) body = [];
    else throw new Error(`API không mong đợi: ${request.method()} ${path}`);
    await route.fulfill({ json: body });
  });
  return calls;
};
