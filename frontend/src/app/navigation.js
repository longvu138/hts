import { APP_NAME } from "../constants/app.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { hasPermission } from "../utils/permissions.js";

export const getDefaultAuthenticatedPath = () => "/work";

/**
 * Nguồn duy nhất cho menu (sidebar, bottom nav) và quyền vào route.
 * `anyOf`: chỉ cần một quyền trong danh sách; khớp với điều kiện route trong AppRoutes.
 * `managePermission`: có quyền này thì nhãn hành động là "Quản lý …", ngược lại là "Xem …".
 */
export const NAV_ITEMS = Object.freeze([
  { key: "work", path: "/work", label: "Công việc", title: "Công việc", matchPrefix: true },
  {
    key: "departments",
    path: "/departments",
    label: "Phòng ban",
    title: "Phòng ban",
    anyOf: [PERMISSIONS.DEPARTMENT_VIEW, PERMISSIONS.DEPARTMENT_MANAGE],
    managePermission: PERMISSIONS.DEPARTMENT_MANAGE,
  },
  {
    key: "staff",
    path: "/staff",
    label: "Cán bộ",
    title: "Cán bộ",
    anyOf: [PERMISSIONS.STAFF_VIEW, PERMISSIONS.STAFF_MANAGE],
    managePermission: PERMISSIONS.STAFF_MANAGE,
  },
  {
    key: "roles",
    path: "/system/roles",
    label: "Vai trò & Quyền",
    title: "Vai trò & Quyền",
    anyOf: [PERMISSIONS.SYSTEM_MANAGE],
    managePermission: PERMISSIONS.SYSTEM_MANAGE,
  },
]);

const NAV_ITEM_BY_KEY = Object.freeze(Object.fromEntries(NAV_ITEMS.map((item) => [item.key, item])));

export const getNavItem = (key) => NAV_ITEM_BY_KEY[key] || null;

export const canAccessNavItem = (currentUser, itemOrKey) => {
  const item = typeof itemOrKey === "string" ? getNavItem(itemOrKey) : itemOrKey;
  if (!item || !currentUser) return false;
  const required = Array.isArray(item.anyOf) ? item.anyOf : [];
  return required.length === 0 || required.some((permission) => hasPermission(currentUser, permission));
};

export const canManageNavItem = (currentUser, itemOrKey) => {
  const item = typeof itemOrKey === "string" ? getNavItem(itemOrKey) : itemOrKey;
  return Boolean(item?.managePermission) && hasPermission(currentUser, item.managePermission);
};

export const getVisibleNavItems = (currentUser) =>
  NAV_ITEMS.filter((item) => canAccessNavItem(currentUser, item));

export const isNavItemActive = (item, pathname = "") =>
  pathname === item?.path || Boolean(item?.matchPrefix && pathname.startsWith(`${item.path}/`));

const STANDALONE_TITLES = Object.freeze({
  "/login": "Đăng nhập",
  "/change-password": "Đổi mật khẩu",
});

export const getRouteTitle = (pathname = "/") => {
  if (STANDALONE_TITLES[pathname]) return STANDALONE_TITLES[pathname];
  const item = NAV_ITEMS.find((navItem) => isNavItemActive(navItem, pathname === "/" ? getDefaultAuthenticatedPath() : pathname));
  return item?.title || "";
};

export const formatDocumentTitle = (title) => (title ? `${title} · ${APP_NAME}` : APP_NAME);
