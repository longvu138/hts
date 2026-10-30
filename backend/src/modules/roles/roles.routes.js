const express = require("express");

const { PERMISSIONS } = require("../../constants/permissions");
const rolesController = require("./roles.controller");
const { authenticate, requirePasswordReady, requirePermission } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate, requirePasswordReady);

/**
 * GET /roles/actions
 * Dùng để lấy danh sách permission action đang có trong hệ thống.
 * Quyền: system.manage.
 * Success 200: PermissionAction[].
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage.
 */
router.get("/actions", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.listActions);

/**
 * POST /roles/actions
 * Dùng để tạo permission action mới để đưa vào ma trận phân quyền.
 * Quyền: system.manage.
 * Body: { name, label, groupName, description?, sortOrder? }.
 * Success 201: PermissionAction.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 422 thiếu field/name sai format/name trùng.
 */
router.post("/actions", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.createAction);

/**
 * PATCH /roles/actions/:name
 * Dùng để cập nhật metadata hoặc bật/tắt permission action.
 * Quyền: system.manage.
 * Params: name = tên action, ví dụ staff.view.
 * Body: { label?, groupName?, description?, sortOrder?, isActive? }.
 * Success 200: PermissionAction.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 404 không tìm thấy action.
 */
router.patch("/actions/:name", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.updateAction);

/**
 * GET /roles
 * Dùng để lấy danh sách role active cho màn nhân sự/gán vai trò.
 * Quyền: staff.view.
 * Success 200: Role[].
 * Fail: 401 chưa đăng nhập; 403 thiếu staff.view.
 */
router.get("/", requirePermission(PERMISSIONS.STAFF_VIEW), rolesController.listRoles);

/**
 * POST /roles
 * Dùng để tạo role động mới.
 * Quyền: system.manage.
 * Body: { name, label, level? }.
 * Success 201: Role.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 422 thiếu field/name sai format/name trùng.
 */
router.post("/", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.createRole);

/**
 * PATCH /roles/:id
 * Dùng để cập nhật label/level/trạng thái active của role.
 * Quyền: system.manage.
 * Params: id = role id.
 * Body: { label?, level?, isActive? }.
 * Success 200: Role.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 404 không tìm thấy role; 422 không thể tắt role hệ thống.
 */
router.patch("/:id", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.updateRole);

/**
 * DELETE /roles/:id
 * Dùng để tắt role động (soft delete is_active = 0).
 * Quyền: system.manage.
 * Params: id = role id.
 * Success 200: { message }.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 404 không tìm thấy role; 422 không thể tắt role hệ thống.
 */
router.delete("/:id", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.deleteRole);

/**
 * GET /roles/permissions-matrix
 * Dùng để lấy ma trận role -> permission actions active.
 * Quyền: system.manage.
 * Success 200: { [roleId]: string[] }.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage.
 */
router.get("/permissions-matrix", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.getRolePermissionsMatrix);

/**
 * GET /roles/:id/permissions
 * Dùng để lấy danh sách permission action của một role.
 * Quyền: system.manage.
 * Params: id = role id.
 * Success 200: string[].
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 404 không tìm thấy role.
 */
router.get("/:id/permissions", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.getRolePermissions);

/**
 * PUT /roles/:id/permissions
 * Dùng để ghi đè toàn bộ permission actions của một role.
 * Quyền: system.manage.
 * Params: id = role id.
 * Body: { actions: string[] }.
 * Success 200: string[] action sau khi lưu.
 * Fail: 401 chưa đăng nhập; 403 thiếu system.manage; 404 không tìm thấy role; 422 action không hợp lệ.
 */
router.put("/:id/permissions", requirePermission(PERMISSIONS.SYSTEM_MANAGE), rolesController.updateRolePermissions);

module.exports = router;
