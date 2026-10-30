const { verifyPassword } = require("../../utils/password-hash");
const { validateLoginInput, httpError } = require("./auth.validator");
const jwt = require("jsonwebtoken");
const db = require("../../config/database");
const permissionsService = require("../../services/permissions.service");
const roleAssignmentsService = require("../../services/role-assignments.service");
const authSessionsService = require("./auth-sessions.service");
const { createCsrfToken, setAuthCookie } = require("../../utils/auth-cookie");

const buildUserResponse = async (user) => {
  const roleAssignments = await roleAssignmentsService.listAssignments(user.id);
  const managedDepartmentIds = await roleAssignmentsService.getManagedDepartmentIds(user.id);
  const permissions = await permissionsService.getPublicPermissions(user.id);

  let departmentName = null;
  if (user.department_id) {
    const dept = await db("departments").where({ id: user.department_id }).first();
    if (dept) {
      departmentName = dept.name;
    }
  }

  return {
    id: user.id,
    code: user.code,
    name: user.full_name,
    username: user.username,
    position: user.position,
    departmentId: user.department_id,
    departmentName,
    permissions,
    roleAssignments,
    managedDepartmentIds,
    mustChangePassword: Boolean(user.must_change_password),
  };
};

const issueSessionCookie = async (user, req, res) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw httpError(500, "Chưa cấu hình khóa xác thực JWT_SECRET");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "1d";
  const tokenVersion = Number(user.token_version || 0);
  const session = await authSessionsService.createSession({
    req,
    userId: user.id,
    tokenVersion,
    expiresIn,
  });
  const accessToken = jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      tokenVersion,
    },
    secret,
    {
      algorithm: "HS256",
      audience: process.env.JWT_AUDIENCE || "hts-web",
      issuer: process.env.JWT_ISSUER || "hts-backend",
      jwtid: session.id,
      expiresIn,
    },
  );
  setAuthCookie(res, accessToken, session.expiresAt);
  return {
    expiresIn,
    sessionId: session.publicId,
    csrfToken: createCsrfToken(session.id),
  };
};

const authenticateLogin = async (input) => {
  const { username, password } = validateLoginInput(input);
  const user = await db("staff_members").where({ username }).first();
  // Always run one bcrypt comparison (dummy hash for unknown users) to keep timing uniform.
  const passwordMatches = await verifyPassword(password, user?.password_hash);
  if (!user?.is_active || !user.password_hash || !passwordMatches) {
    const error = httpError(401, "Tên tài khoản hoặc mật khẩu không chính xác");
    error.authReason = user && !user.is_active ? "inactive_account" : "invalid_credentials";
    throw error;
  }
  await db("staff_members").where({ id: user.id }).update({ last_login_at: db.fn.now(), must_change_password: user.must_change_password ?? 0 });
  return { ...user, must_change_password: user.must_change_password ?? 0 };
};
module.exports = { buildUserResponse, issueSessionCookie, authenticateLogin };
