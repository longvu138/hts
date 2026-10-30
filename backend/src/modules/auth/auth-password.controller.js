const passwords = require("./auth-password.service");
const { auditLog } = require("../../utils/audit-log");
const { buildUserResponse, issueSessionCookie } = require("./auth.service");

const changePassword = async (req, res, next) => {
  try {
    const user = await passwords.changePassword(req.user, req.body);
    auditLog(req, "info", { event: "auth_password_changed", targetUserId: user.id, statusCode: 200 });
    return res.json({ message: "Đổi mật khẩu thành công", ...(await issueSessionCookie(user, req, res)), user: await buildUserResponse(user) });
  } catch (error) { return next(error); }
};
const adminResetPassword = async (req, res, next) => {
  try {
    const user = await passwords.resetPassword(req.user.id, req.params.userId, req.body);
    auditLog(req, "warn", { event: "auth_password_reset", targetUserId: user.id, statusCode: 200 });
    return res.json({ message: "Đã reset mật khẩu. Người dùng sẽ phải đổi mật khẩu khi đăng nhập lại", user: await buildUserResponse(user) });
  } catch (error) { return next(error); }
};
module.exports = { changePassword, adminResetPassword };
