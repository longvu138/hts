const db = require("../config/database");
const { PERMISSIONS } = require("../constants/permissions");

const { conflict } = require("../utils/http-error");

const countActiveAdministrators = async (trx) => {
  const row = await trx("staff_members as staff")
    .join("staff_role_assignments as assignment", "assignment.staff_member_id", "staff.id")
    .join("roles as role", "role.id", "assignment.role_id")
    .join("role_permissions as permission", "permission.role_id", "role.id")
    .join("permission_actions as action", "action.name", "permission.action")
    .where("staff.is_active", 1)
    .whereNotNull("staff.password_hash")
    .whereNot("staff.password_hash", "")
    .where("assignment.is_active", 1)
    .where("role.is_active", 1)
    .where("action.is_active", 1)
    .where("permission.action", PERMISSIONS.SYSTEM_MANAGE)
    .countDistinct({ total: "staff.id" }).first();
  return Number(row?.total || 0);
};

const withAdminSafetyMutation = async (mutate, { bootstrap = false } = {}) => db.transaction(async (trx) => {
  const state = await trx("administration_state").where({ id: 1 }).forUpdate().first();
  if (!state) throw new Error("Chưa có trạng thái quản trị, vui lòng chạy migration");
  const before = await countActiveAdministrators(trx);
  if (bootstrap && (state.bootstrap_completed || before > 0 || await trx("staff_members").select("id").first())) {
    throw conflict("Hệ thống đã được khởi tạo, không thể tạo lại quản trị viên đầu tiên");
  }
  const result = await mutate(trx);
  const after = await countActiveAdministrators(trx);
  if ((before > 0 || bootstrap) && after === 0) {
    throw conflict("Không thể thực hiện vì hệ thống phải còn ít nhất một quản trị viên hoạt động");
  }
  if (bootstrap) await trx("administration_state").where({ id: 1 }).update({ bootstrap_completed: true });
  return result;
});

module.exports = { countActiveAdministrators, withAdminSafetyMutation };
