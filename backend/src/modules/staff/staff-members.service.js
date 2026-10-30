const { withAdminSafetyMutation } = require("../../services/admin-safety.service");

const db = require("../../config/database");
const { mapStaffMember } = require("./staff-members.mapper");
const permissionsService = require("../../services/permissions.service");
const roleAssignmentsService = require("../../services/role-assignments.service");
const { createUuid } = require("../../utils/uuid");
const { assertPasswordPolicy } = require("../../utils/password-policy");
const { hashPassword } = require("../../utils/password-hash");
const { httpError: createHttpError } = require("../../utils/http-error");

// One rule for "a new password was sent": missing/null/"" means unchanged; anything else must be a string.
const providedPassword = (body = {}) => {
  if (body.password === undefined || body.password === null || body.password === "") return undefined;
  if (typeof body.password !== "string") throw createHttpError(422, "Mật khẩu không hợp lệ");
  return body.password;
};
const { buildPagination, parsePagination } = require("../../utils/pagination");
const { containsPattern } = require("../../utils/sql-like");
const authSessionsService = require("../auth/auth-sessions.service");
const {
  isBlank,
  normalizeOptionalString,
  pickDefined,
  requireFields,
  toBooleanFlag,
} = require("../../utils/validation");

const normalizeListPagination = (query = {}) => parsePagination(query, { defaultLimit: 25 });

const normalizeInitialRoleAssignments = (roleAssignments) =>
  (Array.isArray(roleAssignments) ? roleAssignments : []).filter((assignment) => assignment?.roleId);

const ensureDepartmentExists = async (departmentId) => {
  if (!departmentId) return true;
  const department = await db("departments").where({ id: departmentId }).first();
  return Boolean(department);
};

// Pure mapping + bcrypt; always called before any transaction is opened.
const pickStaffPayload = async (body) => {
  const payload = pickDefined(body, {
    code: "code",
    username: "username",
    fullName: "full_name",
    position: (value) => ({ position: normalizeOptionalString(value) }),
    departmentId: (value) => ({ department_id: value || null }),
    email: (value) => ({ email: normalizeOptionalString(value) }),
    phone: (value) => ({ phone: normalizeOptionalString(value) }),
  });

  if (body.isActive !== undefined) payload.is_active = toBooleanFlag(body.isActive);
  const password = providedPassword(body);
  if (password !== undefined) {
    payload.password_hash = await hashPassword(password);
    payload.must_change_password = body.mustChangePassword === false ? 0 : 1;
  }

  return payload;
};

const appendRoleAssignments = async (staffMembers) => {
  const assignmentsByStaff = await roleAssignmentsService.listAssignmentsForStaffMembers(
    staffMembers.map((staff) => staff.id),
  );

  return staffMembers.map((staff) => ({
    ...staff,
    roleAssignments: assignmentsByStaff[staff.id] || [],
  }));
};

const listStaffMembers = async ({ query: requestQuery = {}, visibleScope }) => {
  const query = db("staff_members").orderBy([{ column: "full_name" }, { column: "id" }]);
  const { page, limit, offset } = normalizeListPagination(requestQuery);

  if (requestQuery.q) {
    const search = containsPattern(String(requestQuery.q).slice(0, 200));
    query.where((builder) => {
      builder
        .where("full_name", "like", search)
        .orWhere("code", "like", search)
        .orWhere("username", "like", search)
        .orWhere("email", "like", search);
    });
  }

  if (requestQuery.departmentId) query.where("department_id", requestQuery.departmentId);
  if (requestQuery.isActive !== undefined) {
    query.where("is_active", requestQuery.isActive === "false" ? 0 : 1);
  }

  const { hasViewAll, departmentIds: deptIds } = visibleScope;
  if (!hasViewAll) {
    if (deptIds.length > 0) {
      query.whereIn("department_id", deptIds);
    } else {
      query.whereRaw("1 = 0");
    }
  }

  const [totalRow, rows] = await Promise.all([
    query.clone().clearOrder().count("id as total").first(),
    query.limit(limit).offset(offset),
  ]);
  const lastSeenAtByUserId = await authSessionsService.getLastSeenAtByUserIds(
    rows.map((row) => row.id),
  );
  const staffMembers = await appendRoleAssignments(
    rows.map((row) => ({ ...mapStaffMember(row), lastSeenAt: lastSeenAtByUserId[row.id] || null })),
  );
  const total = Number(totalRow?.total || 0);
  return {
    staffMembers,
    pagination: buildPagination({ page, limit }, total),
  };
};

const getStaffById = async (staffMemberId) => db("staff_members").where({ id: staffMemberId }).first();

const getStaffMember = async (staffMemberId) => {
  const staff = await getStaffById(staffMemberId);
  if (!staff) {
    throw createHttpError(404, "Không tìm thấy cán bộ tương ứng");
  }

  const lastSeenAtByUserId = await authSessionsService.getLastSeenAtByUserIds([staff.id]);
  return {
    ...mapStaffMember(staff),
    lastSeenAt: lastSeenAtByUserId[staff.id] || null,
    roleAssignments: await roleAssignmentsService.listAssignments(staff.id),
  };
};

const validateCreateStaffBasics = async (body) => {
  const errorResult = requireFields(body, {
    code: "Mã cán bộ",
    username: "Tên đăng nhập",
    fullName: "Họ tên cán bộ",
  });
  if (errorResult) throw createHttpError(422, errorResult.error);

  if (!(await ensureDepartmentExists(body.departmentId))) {
    throw createHttpError(422, "Không tìm thấy phòng ban tương ứng");
  }
  const password = providedPassword(body);
  if (password !== undefined) assertPasswordPolicy(password, { username: body.username });
};

const validateCreateStaffPayload = async (body) => {
  await validateCreateStaffBasics(body);
  const existing = await db("staff_members")
    .where(function duplicateStaff() {
      this.where({ code: body.code });
      if (body.username) this.orWhere({ username: body.username });
      if (body.email) this.orWhere({ email: body.email });
    })
    .first();
  if (existing) {
    throw createHttpError(422, "Mã cán bộ, tên tài khoản hoặc email đã tồn tại");
  }
};

const createStaffMember = async (body) => {
  await validateCreateStaffPayload(body);

  const id = createUuid();
  const initialRoleAssignments = normalizeInitialRoleAssignments(body.roleAssignments);
  // Hash before opening the transaction so a pooled connection is not held during bcrypt.
  const payload = await pickStaffPayload(body);

  await db.transaction(async (trx) => {
    await trx("staff_members").insert({
      id,
      ...payload,
      is_active: body.isActive === undefined ? 1 : body.isActive ? 1 : 0,
    });

    for (const assignment of initialRoleAssignments) {
      await roleAssignmentsService.createAssignment(id, assignment, { trx, skipStaffExists: true });
    }
  });

  permissionsService.invalidatePermissionCache(id);
  return getStaffMember(id);
};

const validateUpdateStaffBasics = async (body) => {
  if (body.code !== undefined && isBlank(body.code)) {
    throw createHttpError(422, "Mã cán bộ không được để trống");
  }
  if (body.username !== undefined && isBlank(body.username)) {
    throw createHttpError(422, "Tên đăng nhập không được để trống");
  }
  if (body.fullName !== undefined && isBlank(body.fullName)) {
    throw createHttpError(422, "Họ tên cán bộ không được để trống");
  }
  if (!(await ensureDepartmentExists(body.departmentId))) {
    throw createHttpError(422, "Không tìm thấy phòng ban tương ứng");
  }
};

const validateUpdateStaffPayload = async (staffMemberId, body) => {
  const current = await getStaffById(staffMemberId);
  if (!current) {
    throw createHttpError(404, "Không tìm thấy cán bộ tương ứng");
  }

  await validateUpdateStaffBasics(body);
  const password = providedPassword(body);
  if (password !== undefined) assertPasswordPolicy(password, { username: body.username || current.username });

  if (body.code || body.username || body.email) {
    const duplicate = await db("staff_members")
      .where(function duplicateStaff() {
        if (body.code) this.orWhere({ code: body.code });
        if (body.username) this.orWhere({ username: body.username });
        if (body.email) this.orWhere({ email: body.email });
      })
      .whereNot({ id: staffMemberId })
      .first();
    if (duplicate) {
      throw createHttpError(422, "Mã cán bộ, tên tài khoản hoặc email đã tồn tại");
    }
  }

  return current;
};

const updateStaffMember = async (staffMemberId, body) => {
  await validateUpdateStaffPayload(staffMemberId, body);

  const payload = await pickStaffPayload(body);
  const invalidatesSessions = providedPassword(body) !== undefined || payload.is_active === 0;
  await withAdminSafetyMutation(async (trx) => {
    await trx("staff_members").where({ id: staffMemberId }).update({
      ...payload,
      ...(invalidatesSessions ? { token_version: trx.raw("COALESCE(token_version, 0) + 1") } : {}),
    });
    if (invalidatesSessions) {
      await authSessionsService.revokeAllSessions({
        userId: staffMemberId,
        reason: payload.is_active === 0 ? "account_disabled" : "password_changed_by_admin",
        trx,
      });
    }
  });
  permissionsService.invalidatePermissionCache(staffMemberId);
  return getStaffMember(staffMemberId);
};

const listRoleAssignments = async (staffMemberId) => {
  if (!(await getStaffById(staffMemberId))) {
    throw createHttpError(404, "Không tìm thấy cán bộ tương ứng");
  }
  return roleAssignmentsService.listAssignments(staffMemberId);
};

const createRoleAssignment = async (staffMemberId, body) => {
  const assignment = await roleAssignmentsService.createAssignment(staffMemberId, body);
  permissionsService.invalidatePermissionCache(staffMemberId);
  return assignment;
};

const updateRoleAssignment = async (staffMemberId, assignmentId, body) => {
  const assignment = await roleAssignmentsService.updateAssignment(staffMemberId, assignmentId, body);
  permissionsService.invalidatePermissionCache(staffMemberId);
  return assignment;
};

const disableRoleAssignment = async (staffMemberId, assignmentId) => {
  const disabled = await roleAssignmentsService.disableAssignment(staffMemberId, assignmentId);
  if (!disabled) {
    throw createHttpError(404, "Không tìm thấy vai trò được gán");
  }
  permissionsService.invalidatePermissionCache(staffMemberId);
  return { message: "Đã tắt vai trò được gán" };
};

module.exports = {
  providedPassword,
  createRoleAssignment,
  createStaffMember,
  disableRoleAssignment,
  getStaffById,
  getStaffMember,
  listRoleAssignments,
  listStaffMembers,
  normalizeListPagination,
  validateCreateStaffBasics,
  validateUpdateStaffBasics,
  updateRoleAssignment,
  updateStaffMember,
};
