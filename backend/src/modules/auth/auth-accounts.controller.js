const accounts = require("./auth-accounts.service");
const { buildUserResponse } = require("./auth.service");
const { auditLog } = require("../../utils/audit-log");

const bootstrapAdmin = async (req, res, next) => {
  try {
    accounts.assertBootstrapToken(req.get(accounts.BOOTSTRAP_TOKEN_HEADER));
    const user = await accounts.bootstrapAdmin(req.body);
    auditLog(req, "warn", { event: "auth_bootstrap_admin_created", targetUserId: user.id, username: user.username, statusCode: 201 });
    return res.status(201).json({ message: "Khởi tạo tài khoản superadmin thành công", user: await buildUserResponse(user) });
  } catch (error) { return next(error); }
};
module.exports = { bootstrapAdmin };
