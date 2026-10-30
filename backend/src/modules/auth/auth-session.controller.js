const db = require("../../config/database");
const permissionsService = require("../../services/permissions.service");
const { PERMISSIONS } = require("../../constants/permissions");
const staffPolicy = require("../staff/staff-members.policy");
const authSessionsService = require("./auth-sessions.service");
const { auditLog } = require("../../utils/audit-log");
const { clearAuthCookie, createCsrfToken } = require("../../utils/auth-cookie");
const { buildUserResponse } = require("./auth.service");

const ensureCanManageTargetSessions = async (req, res) => {
  const context = await permissionsService.getUserPermissionContext(req.user.id);
  const target = await db("staff_members").where({ id: req.params.userId }).first();
  if (!target) {
    res.status(404).json({ message: "Không tìm thấy tài khoản tương ứng" });
    return null;
  }
  if (!permissionsService.can(context, PERMISSIONS.STAFF_MANAGE) || !(await staffPolicy.canManageTargetAccount(context, target))) {
    res.status(403).json({ message: "Bạn không có quyền quản lý phiên của tài khoản này" });
    return null;
  }
  return target;
};

const logout = async (req, res, next) => {
  try {
    await authSessionsService.revokeSession({
      sessionId: req.authSession.id,
      userId: req.user.id,
      revokedBy: req.user.id,
      reason: "logout",
    });
    clearAuthCookie(res);
    auditLog(req, "info", { event: "auth_logout", statusCode: 200 });
    return res.json({ message: "Đăng xuất thành công" });
  } catch (error) {
    return next(error);
  }
};

const listUserSessions = async (req, res, next) => {
  try {
    if (!(await ensureCanManageTargetSessions(req, res))) return;
    const currentSessionId = req.params.userId === req.user.id
      ? req.authSession.id
      : null;
    return res.json(await authSessionsService.listSessions(req.params.userId, {
      currentSessionId,
      query: req.query,
    }));
  } catch (error) {
    return next(error);
  }
};

const revokeUserSession = async (req, res, next) => {
  try {
    if (!(await ensureCanManageTargetSessions(req, res))) return;
    // :sessionId is the opaque public id returned by the session list, never the JWT jti.
    const revoked = await authSessionsService.revokeSessionByPublicId({
      publicId: req.params.sessionId,
      userId: req.params.userId,
      revokedBy: req.user.id,
      reason: "admin_revoked",
    });
    if (!revoked) return res.status(404).json({ message: "Không tìm thấy phiên đang hoạt động" });
    auditLog(req, "warn", {
      event: "auth_session_revoked_by_admin",
      targetUserId: req.params.userId,
      targetSessionId: req.params.sessionId,
      statusCode: 200,
    });
    return res.json({ message: "Đã thu hồi phiên đăng nhập" });
  } catch (error) {
    return next(error);
  }
};

const revokeAllUserSessions = async (req, res, next) => {
  try {
    if (!(await ensureCanManageTargetSessions(req, res))) return;
    const keepCurrentSession =
      req.params.userId === req.user.id && req.body?.exceptCurrent === true;
    const revokedCount = await authSessionsService.revokeAllSessions({
      userId: req.params.userId,
      revokedBy: req.user.id,
      reason: "admin_revoked_all",
      exceptSessionId: keepCurrentSession ? req.authSession.id : null,
    });
    if (!keepCurrentSession) {
      await db("staff_members").where({ id: req.params.userId }).update({
        token_version: db.raw("COALESCE(token_version, 0) + 1"),
      });
    }
    auditLog(req, "warn", {
      event: "auth_all_sessions_revoked_by_admin",
      targetUserId: req.params.userId,
      revokedCount,
      statusCode: 200,
    });
    return res.json({
      message: keepCurrentSession
        ? "Đã thu hồi tất cả phiên đăng nhập khác"
        : "Đã thu hồi tất cả phiên đăng nhập",
      revokedCount,
      keptCurrentSession: keepCurrentSession,
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await db("staff_members").where({ id: req.user.id }).first();
    if (!user) {
      return res.status(404).json({
        message: "Không tìm thấy tài khoản tương ứng",
      });
    }

    res.json({
      csrfToken: createCsrfToken(req.authSession.id),
      user: await buildUserResponse(user),
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { logout, listUserSessions, revokeUserSession, revokeAllUserSessions, me };
