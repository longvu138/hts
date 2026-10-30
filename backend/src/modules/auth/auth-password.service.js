const bcrypt = require("bcryptjs");
const { hashPassword } = require("../../utils/password-hash");
const db = require("../../config/database");
const permissionsService = require("../../services/permissions.service");
const { PERMISSIONS } = require("../../constants/permissions");
const staffPolicy = require("../staff/staff-members.policy");
const { validatePasswordInput, httpError } = require("./auth.validator");

const writePassword = async (user, password, actorId, { reset = false } = {}) => {
  const hash = await hashPassword(password);
  await db.transaction(async (trx) => {
    await trx("staff_members").where({ id: user.id }).update({
      password_hash: hash, must_change_password: reset ? 1 : 0,
      token_version: trx.raw("COALESCE(token_version, 0) + 1"),
      ...(reset ? { password_reset_at: trx.fn.now(), password_reset_by: actorId } : { password_changed_at: trx.fn.now() }),
    });
    await trx("auth_sessions").where({ user_id: user.id }).whereNull("revoked_at").update({ revoked_at: trx.fn.now(), revoked_by: actorId, revoke_reason: reset ? "password_reset" : "password_changed" });
  });
  return db("staff_members").where({ id: user.id }).first();
};
const changePassword = async (actor, body) => {
  const password = validatePasswordInput(body, { change: true, username: actor.username });
  const user = await db("staff_members").where({ id: actor.id }).first();
  if (!user?.password_hash) throw httpError(404, "Không tìm thấy tài khoản tương ứng");
  if (!await bcrypt.compare(body.currentPassword, user.password_hash)) throw httpError(422, "Mật khẩu hiện tại không chính xác");
  if (await bcrypt.compare(password, user.password_hash)) throw httpError(422, "Mật khẩu mới không được trùng mật khẩu hiện tại");
  return writePassword(user, password, actor.id);
};
const resetPassword = async (actorId, targetId, body) => {
  const context = await permissionsService.getUserPermissionContext(actorId);
  const user = await db("staff_members").where({ id: targetId }).first();
  if (!user) throw httpError(404, "Không tìm thấy tài khoản tương ứng");
  if (!permissionsService.can(context, PERMISSIONS.STAFF_MANAGE) || !(await staffPolicy.canManageTargetAccount(context, user))) throw httpError(403, "Bạn không có quyền reset mật khẩu tài khoản này");
  const password = validatePasswordInput(body, { username: user.username });
  return writePassword(user, password, actorId, { reset: true });
};
module.exports = { changePassword, resetPassword };
