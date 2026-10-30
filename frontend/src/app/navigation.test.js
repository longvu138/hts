import assert from "node:assert/strict";
import test from "node:test";
import { canAccessNavItem, canManageNavItem, formatDocumentTitle, getRouteTitle, getVisibleNavItems, getDefaultAuthenticatedPath } from "./navigation.js";

test("menu hiện mục khi có quyền xem hoặc quyền quản lý, giống điều kiện route", () => {
  assert.equal(canAccessNavItem({ permissions: ["staff.manage"] }, "staff"), true);
  assert.equal(canAccessNavItem({ permissions: ["staff.view"] }, "staff"), true);
  assert.equal(canAccessNavItem({ permissions: [] }, "staff"), false);
  assert.equal(canAccessNavItem({ permissions: ["department.manage"] }, "departments"), true);
  assert.equal(canAccessNavItem(null, "home"), false);
  assert.deepEqual(getVisibleNavItems({ permissions: [] }).map((item) => item.key), ["work"]);
});

test("chỉ quyền quản lý mới đổi nhãn sang Quản lý", () => {
  assert.equal(canManageNavItem({ permissions: ["staff.view"] }, "staff"), false);
  assert.equal(canManageNavItem({ permissions: ["staff.manage"] }, "staff"), true);
  assert.equal(canManageNavItem({ permissions: ["system.manage"] }, "departments"), true);
});

test("tiêu đề trang theo route", () => {
  assert.equal(getRouteTitle("/"), "Công việc");
  assert.equal(getRouteTitle("/work"), "Công việc");
  assert.equal(getRouteTitle("/staff"), "Cán bộ");
  assert.equal(getRouteTitle("/system/roles"), "Vai trò & Quyền");
  assert.equal(getRouteTitle("/change-password"), "Đổi mật khẩu");
  assert.equal(getRouteTitle("/khong-ton-tai"), "");
  assert.equal(formatDocumentTitle("Cán bộ"), "Cán bộ · HTS");
  assert.equal(formatDocumentTitle(""), "HTS");
});

test("đường dẫn mặc định sau đăng nhập là công việc", () => {
  assert.equal(getDefaultAuthenticatedPath(), "/work");
  assert.equal(canAccessNavItem({ permissions: ["system.manage"] }, "home"), false);
});
