const express = require("express");

const { PERMISSIONS } = require("../../constants/permissions");
const authController = require("./auth.controller");
const { authenticate, requirePasswordReady, requirePermission } = require("../../middlewares/auth.middleware");
const { loginIpLimiter, loginLimiter, sensitiveAuthLimiter } = require("../../middlewares/rate-limit.middleware");

const router = express.Router();

/**
 * POST /auth/login
 * Dùng để đăng nhập và nhận cookie phiên HttpOnly.
 * Quyền: public.
 * Body: { username: string, password: string }.
 * Success 200: { expiresIn, sessionId, csrfToken, user } và Set-Cookie.
 * Fail: 422 thiếu username/password; 401 sai tài khoản/mật khẩu; 500 nếu thiếu JWT_SECRET.
 */
router.post("/login", loginIpLimiter, loginLimiter, authController.login);

/**
 * POST /auth/bootstrap-admin
 * Dùng để khởi tạo superadmin đầu tiên khi hệ thống chưa có tài khoản hệ thống.
 * Quyền: header X-Bootstrap-Token phải khớp BOOTSTRAP_TOKEN của máy chủ; thiếu biến môi trường thì API tắt.
 * Chỉ chạy được một lần trên database trắng.
 * Body: { username, password, fullName?, position?, departmentId?, phone?, email? }.
 * Success 201: { message, user }.
 * Fail: 403 BOOTSTRAP_DISABLED/BOOTSTRAP_TOKEN_INVALID; 409 đã khởi tạo; 422 thiếu dữ liệu hoặc department/email/username không hợp lệ.
 */
router.post("/bootstrap-admin", sensitiveAuthLimiter, authController.bootstrapAdmin);

/**
 * POST /auth/admin/reset-password/:userId
 * Dùng để admin reset mật khẩu tạm cho một tài khoản.
 * Quyền: staff.manage, scope staff.manage phải bao phủ phòng ban của user được reset.
 * Params: userId = id tài khoản cần reset.
 * Body: { password: string, confirmPassword: string }.
 * Success 200: { message, user }.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope; 404 không tìm thấy user; 422 mật khẩu không hợp lệ.
 */
router.post(
  "/admin/reset-password/:userId",
  sensitiveAuthLimiter,
  authenticate,
  requirePasswordReady,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  authController.adminResetPassword,
);

/**
 * POST /auth/change-password
 * Dùng để người dùng đổi mật khẩu của chính mình.
 * Quyền: đã đăng nhập, không yêu cầu requirePasswordReady để user bắt buộc đổi mật khẩu vẫn đổi được.
 * Body: { currentPassword, newPassword, confirmPassword }.
 * Success 200: { message, user }.
 * Fail: 401 chưa đăng nhập; 404 không tìm thấy user; 422 thiếu/sai mật khẩu hoặc mật khẩu mới không hợp lệ.
 */
router.post("/change-password", sensitiveAuthLimiter, authenticate, authController.changePassword);

router.post("/logout", authenticate, authController.logout);

router.get(
  "/admin/users/:userId/sessions",
  authenticate,
  requirePasswordReady,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  authController.listUserSessions,
);

router.delete(
  "/admin/users/:userId/sessions/:sessionId",
  authenticate,
  requirePasswordReady,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  authController.revokeUserSession,
);

router.post(
  "/admin/users/:userId/sessions/revoke-all",
  sensitiveAuthLimiter,
  authenticate,
  requirePasswordReady,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  authController.revokeAllUserSessions,
);

/**
 * GET /auth/me
 * Dùng để lấy thông tin user hiện tại, permissions, roleAssignments và managedDepartmentIds.
 * Quyền: đã đăng nhập.
 * Success 200: { user }.
 * Fail: 401 token không hợp lệ/hết hạn; 404 không tìm thấy tài khoản.
 */
router.get("/me", authenticate, authController.me);

module.exports = router;
