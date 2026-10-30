const { withAdminSafetyMutation } = require("./admin-safety.service");
const db = require("../config/database");
const { createUuid } = require("../utils/uuid");
const { getDescendantDepartmentIds } = require("./org.service");
const { httpError } = require("../utils/http-error");

const SCOPE_TYPES = ["system", "department", "department_tree", "specific_departments"];

const normalizeDepartmentIds = (departmentIds) =>
  [...new Set((Array.isArray(departmentIds) ? departmentIds : []).filter(Boolean))];

const normalizeIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];

const mapAssignment = (assignment, departmentIds = []) => ({
  id: assignment.id,
  staffMemberId: assignment.staff_member_id,
  roleId: assignment.role_id,
  roleName: assignment.role_name,
  roleLabel: assignment.role_label || assignment.role_name,
  roleLevel: assignment.role_level,
  roleIsSystem: Boolean(assignment.role_is_system),
  departmentId: assignment.department_id,
  scopeType: assignment.scope_type,
  departmentIds,
  isActive: Boolean(assignment.is_active),
  createdAt: assignment.created_at,
  updatedAt: assignment.updated_at,
});

// Every helper takes the active client so nothing escapes an open transaction (pool <= 4).
const ensureStaffExists = async (staffMemberId, client = db) => {
  const staff = await client("staff_members").where({ id: staffMemberId }).first();
  return Boolean(staff);
};

const ensureRoleExists = async (roleId, client = db) => {
  const role = await client("roles").where({ id: roleId, is_active: 1 }).first();
  return Boolean(role);
};

const ensureDepartmentsExist = async (departmentIds, client = db) => {
  const ids = normalizeDepartmentIds(departmentIds);
  if (!ids.length) return true;
  const rows = await client("departments").whereIn("id", ids).select("id");
  return rows.length === ids.length;
};

const validateAssignmentPayload = async (payload, { partial = false, client = db } = {}) => {
  const next = {};

  if (payload.roleId !== undefined) {
    if (!payload.roleId || !(await ensureRoleExists(payload.roleId, client))) {
      return { error: "Vai trò không hợp lệ" };
    }
    next.role_id = payload.roleId;
  } else if (!partial) {
    return { error: "Vai trò là bắt buộc" };
  }

  if (payload.scopeType !== undefined) {
    if (!SCOPE_TYPES.includes(payload.scopeType)) {
      return { error: "Phạm vi vai trò không hợp lệ" };
    }
    next.scope_type = payload.scopeType;
  } else if (!partial) {
    next.scope_type = "department";
  }

  if (payload.isActive !== undefined) {
    next.is_active = payload.isActive ? 1 : 0;
  }

  const scopeType = next.scope_type || payload.currentScopeType;
  if (payload.departmentId !== undefined) {
    next.department_id = payload.departmentId || null;
  }

  if (["department", "department_tree"].includes(scopeType)) {
    const departmentId = next.department_id ?? payload.currentDepartmentId;
    if (!departmentId) return { error: "Vui lòng chọn đơn vị cho phạm vi này" };
    if (!(await ensureDepartmentsExist([departmentId], client))) {
      return { error: "Không tìm thấy đơn vị tương ứng" };
    }
  }

  if (scopeType === "system") {
    next.department_id = null;
  }

  if (payload.departmentIds !== undefined) {
    const departmentIds = normalizeDepartmentIds(payload.departmentIds);
    if (scopeType === "specific_departments" && !departmentIds.length) {
      return { error: "Vui lòng chọn ít nhất một đơn vị" };
    }
    if (!(await ensureDepartmentsExist(departmentIds, client))) {
      return { error: "Danh sách đơn vị có giá trị không hợp lệ" };
    }
    next.departmentIds = departmentIds;
  } else if ((!partial || payload.scopeType === "specific_departments") && scopeType === "specific_departments") {
    return { error: "Vui lòng chọn ít nhất một đơn vị" };
  }

  next.updated_at = client.fn.now();
  return { payload: next };
};

const listAssignments = async (staffMemberId, trx = db) => {
  const rows = await trx("staff_role_assignments as assignment")
    .join("roles as role", "role.id", "assignment.role_id")
    .where("assignment.staff_member_id", staffMemberId)
    .select(
      "assignment.*",
      "role.name as role_name",
      "role.label as role_label",
      "role.level as role_level",
      "role.is_system as role_is_system",
    )
    .orderBy("assignment.is_active", "desc")
    .orderBy("role.level", "desc")
    .orderBy("assignment.created_at", "asc");

  if (!rows.length) return [];

  const scopeRows = await trx("staff_role_assignment_departments")
    .whereIn(
      "assignment_id",
      rows.map((assignment) => assignment.id),
    )
    .select("assignment_id", "department_id");
  const departmentsByAssignment = scopeRows.reduce((grouped, row) => {
    grouped[row.assignment_id] = grouped[row.assignment_id] || [];
    grouped[row.assignment_id].push(row.department_id);
    return grouped;
  }, {});

  return rows.map((assignment) => mapAssignment(assignment, departmentsByAssignment[assignment.id] || []));
};

const listAssignmentsForStaffMembers = async (staffMemberIds = [], trx = db) => {
  const ids = normalizeIds(staffMemberIds);
  if (!ids.length) return {};

  const rows = await trx("staff_role_assignments as assignment")
    .join("roles as role", "role.id", "assignment.role_id")
    .whereIn("assignment.staff_member_id", ids)
    .select(
      "assignment.*",
      "role.name as role_name",
      "role.label as role_label",
      "role.level as role_level",
      "role.is_system as role_is_system",
    )
    .orderBy("assignment.staff_member_id", "asc")
    .orderBy("assignment.is_active", "desc")
    .orderBy("role.level", "desc")
    .orderBy("assignment.created_at", "asc");

  if (!rows.length) return Object.fromEntries(ids.map((id) => [id, []]));

  const scopeRows = await trx("staff_role_assignment_departments")
    .whereIn(
      "assignment_id",
      rows.map((assignment) => assignment.id),
    )
    .select("assignment_id", "department_id");
  const departmentsByAssignment = scopeRows.reduce((grouped, row) => {
    grouped[row.assignment_id] = grouped[row.assignment_id] || [];
    grouped[row.assignment_id].push(row.department_id);
    return grouped;
  }, {});

  const grouped = Object.fromEntries(ids.map((id) => [id, []]));
  rows.forEach((assignment) => {
    grouped[assignment.staff_member_id] = grouped[assignment.staff_member_id] || [];
    grouped[assignment.staff_member_id].push(
      mapAssignment(assignment, departmentsByAssignment[assignment.id] || []),
    );
  });
  return grouped;
};

const createAssignment = async (staffMemberId, body, options = {}) => {
  const trx = options.trx || db;
  if (!options.skipStaffExists && !(await ensureStaffExists(staffMemberId, trx))) {
    throw httpError(404, "Không tìm thấy cán bộ tương ứng");
  }

  const validation = await validateAssignmentPayload(body, { client: trx });
  if (validation.error) throw httpError(422, validation.error);

  const id = createUuid();
  const { departmentIds, ...payload } = validation.payload;

  const insertAssignment = async (transaction) => {
    await transaction("staff_role_assignments").insert({
      id,
      staff_member_id: staffMemberId,
      ...payload,
      is_active: payload.is_active ?? 1,
    });

    if (payload.scope_type === "specific_departments" && departmentIds?.length) {
      await transaction("staff_role_assignment_departments").insert(
        departmentIds.map((departmentId) => ({ assignment_id: id, department_id: departmentId })),
      );
    }
  };

  if (options.trx) {
    await insertAssignment(trx);
  } else {
    await db.transaction(insertAssignment);
  }

  return (await listAssignments(staffMemberId, trx)).find((assignment) => assignment.id === id);
};

const updateAssignment = async (staffMemberId, assignmentId, body) => {
  const current = await db("staff_role_assignments")
    .where({ id: assignmentId, staff_member_id: staffMemberId })
    .first();
  if (!current) throw httpError(404, "Không tìm thấy vai trò được gán");

  // Validation runs before the admin-safety transaction; no transaction is open here.
  const validation = await validateAssignmentPayload({
    ...body,
    currentScopeType: current.scope_type,
    currentDepartmentId: current.department_id,
  }, { partial: true });
  if (validation.error) throw httpError(422, validation.error);

  const { departmentIds, ...payload } = validation.payload;
  await withAdminSafetyMutation(async (trx) => {
    if (Object.keys(payload).length) {
      await trx("staff_role_assignments").where({ id: assignmentId }).update(payload);
    }

    const nextScopeType = payload.scope_type || current.scope_type;
    if (nextScopeType !== "specific_departments") {
      await trx("staff_role_assignment_departments").where({ assignment_id: assignmentId }).delete();
    } else if (departmentIds) {
      await trx("staff_role_assignment_departments").where({ assignment_id: assignmentId }).delete();
      await trx("staff_role_assignment_departments").insert(
        departmentIds.map((departmentId) => ({ assignment_id: assignmentId, department_id: departmentId })),
      );
    }
  });

  return (await listAssignments(staffMemberId)).find((assignment) => assignment.id === assignmentId);
};

const disableAssignment = async (staffMemberId, assignmentId) => {
  const updated = await withAdminSafetyMutation((trx) => trx("staff_role_assignments")
    .where({ id: assignmentId, staff_member_id: staffMemberId })
    .update({ is_active: 0, updated_at: trx.fn.now() }));
  return Boolean(updated);
};

const getManagedDepartmentIds = async (staffMemberId, options = {}) => {
  const assignments = (options.assignments || await listAssignments(staffMemberId))
    .filter((assignment) => assignment.isActive);
  if (assignments.some((assignment) => assignment.scopeType === "system")) {
    const departments = options.departments || await db("departments").where({ is_active: 1 }).select("id");
    return departments.map((department) => department.id);
  }

  const departments = options.departments || await db("departments").where({ is_active: 1 }).select("id", "parent_id");
  const managed = new Set();
  assignments.forEach((assignment) => {
    if (assignment.scopeType === "department" && assignment.departmentId) {
      managed.add(assignment.departmentId);
    }
    if (assignment.scopeType === "department_tree" && assignment.departmentId) {
      managed.add(assignment.departmentId);
      getDescendantDepartmentIds(departments, assignment.departmentId).forEach((id) => managed.add(id));
    }
    if (assignment.scopeType === "specific_departments") {
      assignment.departmentIds.forEach((id) => managed.add(id));
    }
  });
  return [...managed];
};

module.exports = {
  createAssignment,
  disableAssignment,
  getManagedDepartmentIds,
  listAssignments,
  listAssignmentsForStaffMembers,
  updateAssignment,
};
