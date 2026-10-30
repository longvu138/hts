const crypto = require("crypto");
const { hashPassword } = require("../../utils/password-hash");
const { createUuid } = require("../../utils/uuid");
const permissionsService = require("../../services/permissions.service");
const { withAdminSafetyMutation } = require("../../services/admin-safety.service");
const { validateAccountInput, httpError } = require("./auth.validator");

const validateReferences = async (client, body) => {
  const existing = await client("staff_members").where(function duplicate() {
    this.where({ username: body.username }).orWhere({ code: body.code || body.username });
    if (body.email) this.orWhere({ email: body.email });
  }).first();
  if (existing) throw httpError(422, "Tên tài khoản, mã cán bộ hoặc email đã được sử dụng");
  if (body.departmentId && !await client("departments").where({ id: body.departmentId }).first()) throw httpError(422, "Không tìm thấy phòng ban tương ứng");
};

const insertAdminAccount = async (trx, body, passwordHash) => {
  await validateReferences(trx, body);
  const id = createUuid();
  await trx("staff_members").insert({
    id, code: body.code || body.username, username: body.username,
    full_name: body.fullName || "Quản trị hệ thống",
    email: body.email || null, password_hash: passwordHash,
    position: body.position || "Quản trị viên tối cao", department_id: body.departmentId || null,
    phone: body.phone || null,
    is_active: 1, must_change_password: 0, password_changed_at: trx.fn.now(),
  });
  return trx("staff_members").where({ id }).first();
};

const bootstrapAdmin = async (input) => {
  const body = validateAccountInput(input);
  const passwordHash = await hashPassword(body.password);
  const user = await withAdminSafetyMutation(async (trx) => {
    const role = await trx("roles").where({ name: "superadmin", is_active: 1 }).first();
    if (!role) throw httpError(500, "Chưa có vai trò quản trị hệ thống, vui lòng kiểm tra migration");
    const created = await insertAdminAccount(trx, body, passwordHash);
    await trx("staff_role_assignments").insert({ id: createUuid(), staff_member_id: created.id, role_id: role.id, scope_type: "system", department_id: null, is_active: 1 });
    return created;
  }, { bootstrap: true });
  permissionsService.invalidatePermissionCache(user.id);
  return user;
};
// Public bootstrap needs the one-time BOOTSTRAP_TOKEN from the server environment.
// Without it the endpoint stays closed; operators can use scripts/bootstrap-admin.js instead.
const BOOTSTRAP_TOKEN_HEADER = "x-bootstrap-token";
const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest();
const assertBootstrapToken = (provided, expected = process.env.BOOTSTRAP_TOKEN) => {
  if (!expected) {
    throw httpError(403, "Khởi tạo quản trị qua API đang tắt. Cấu hình BOOTSTRAP_TOKEN trên máy chủ hoặc dùng script bootstrap-admin", "BOOTSTRAP_DISABLED");
  }
  // Hash both sides so timingSafeEqual compares equal-length buffers.
  if (typeof provided !== "string" || !provided || !crypto.timingSafeEqual(sha256(provided), sha256(expected))) {
    throw httpError(403, "Mã khởi tạo quản trị không hợp lệ", "BOOTSTRAP_TOKEN_INVALID");
  }
};
module.exports = { BOOTSTRAP_TOKEN_HEADER, assertBootstrapToken, bootstrapAdmin };
