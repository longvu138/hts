const db = require("../../config/database");
const { PERMISSIONS } = require("../../constants/permissions");
const permissionsService = require("../../services/permissions.service");
const { getDescendantDepartmentIds } = require("../../services/org.service");

const getRolePermissions = async (roleId) =>
  db("role_permissions as rp")
    .join("permission_actions as pa", "pa.name", "rp.action")
    .where("rp.role_id", roleId)
    .where("pa.is_active", 1)
    .pluck("rp.action");

const getCurrentAssignment = async (staffMemberId, assignmentId) => {
  if (!assignmentId) return null;
  const current = await db("staff_role_assignments")
    .where({ id: assignmentId, staff_member_id: staffMemberId })
    .first();
  if (!current) return null;
  const departmentIds = current.scope_type === "specific_departments"
    ? await db("staff_role_assignment_departments").where({ assignment_id: current.id }).pluck("department_id")
    : [];
  return {
    roleId: current.role_id,
    scopeType: current.scope_type,
    departmentId: current.department_id || null,
    departmentIds,
  };
};

const buildDraft = (current, body = {}) => {
  const scopeType = body.scopeType !== undefined ? body.scopeType : current?.scopeType || "department";
  let departmentIds = Array.isArray(body.departmentIds) ? body.departmentIds.filter(Boolean) : undefined;
  if (departmentIds === undefined) departmentIds = scopeType === "specific_departments" ? current?.departmentIds || [] : [];
  return {
    roleId: body.roleId !== undefined ? body.roleId : current?.roleId,
    scopeType,
    departmentId: body.departmentId !== undefined ? body.departmentId || null : current?.departmentId || null,
    departmentIds,
  };
};

const isSystemManager = (context) => permissionsService.can(context, PERMISSIONS.SYSTEM_MANAGE);

const canViewStaff = (context, staff) => Boolean(
  staff?.department_id
    ? permissionsService.canAccessDepartmentForAction(context, PERMISSIONS.STAFF_VIEW, staff.department_id)
    : permissionsService.hasSystemScopeForAction(context, PERMISSIONS.STAFF_VIEW),
);

const canManageStaff = (context, staff) => Boolean(
  staff?.department_id
    ? permissionsService.canAccessDepartmentForAction(context, PERMISSIONS.STAFF_MANAGE, staff.department_id)
    : permissionsService.hasSystemScopeForAction(context, PERMISSIONS.STAFF_MANAGE),
);

const canManageStaffDepartment = (context, departmentId) => Boolean(
  departmentId
    ? permissionsService.canAccessDepartmentForAction(context, PERMISSIONS.STAFF_MANAGE, departmentId)
    : permissionsService.hasSystemScopeForAction(context, PERMISSIONS.STAFF_MANAGE),
);

// A department_tree grant can only come from a tree/system staff.manage scope that covers it.
const canGrantTreeScope = (context, departmentId) =>
  permissionsService.hasSystemScopeForAction(context, PERMISSIONS.STAFF_MANAGE) ||
  (context?.permissionScopes || []).some((scope) =>
    scope.action === PERMISSIONS.STAFF_MANAGE &&
    scope.scopeType === "department_tree" &&
    (scope.departmentIds || []).includes(departmentId));

/**
 * Pure check of one assignment draft against the actor. Returns a Vietnamese 403 message or null.
 * Rules (system.manage bypasses all): no system scope / system role / system.manage grant;
 * tree scope only from a covering tree scope; departments inside the actor's staff.manage scope;
 * the actor must already hold every permission of the role being granted.
 */
const getAssignmentDraftDenial = (context, draft, role, rolePermissions = []) => {
  if (isSystemManager(context)) return null;
  const requiresSystemManage =
    draft.scopeType === "system" ||
    Boolean(role?.is_system) ||
    rolePermissions.includes(PERMISSIONS.SYSTEM_MANAGE);
  if (requiresSystemManage) return "Chỉ quản trị hệ thống được gán vai trò/phạm vi hệ thống";

  if (draft.scopeType === "department_tree" && draft.departmentId && !canGrantTreeScope(context, draft.departmentId)) {
    return "Bạn chỉ được gán phạm vi cây đơn vị khi chính bạn có phạm vi cây bao trùm đơn vị đó";
  }
  const scopedDepartmentIds =
    draft.scopeType === "specific_departments"
      ? draft.departmentIds
      : ["department", "department_tree"].includes(draft.scopeType)
        ? [draft.departmentId]
        : [];
  if (scopedDepartmentIds.filter(Boolean).some((departmentId) => !canManageStaffDepartment(context, departmentId))) {
    return "Bạn không có quyền gán vai trò trong đơn vị đã chọn";
  }
  const missing = rolePermissions.filter((action) => !permissionsService.can(context, action));
  if (missing.length) return "Bạn không thể gán vai trò có quyền mà chính bạn chưa được cấp";
  return null;
};

const checkDraft = async (context, draft) => {
  const role = draft.roleId ? await db("roles").where({ id: draft.roleId }).first() : null;
  const rolePermissions = role ? await getRolePermissions(role.id) : [];
  return getAssignmentDraftDenial(context, draft, role, rolePermissions);
};

const loadContext = async (req) =>
  req.permissionContext || permissionsService.getUserPermissionContext(req.user.id);

/**
 * Whether the actor may perform account-level actions (password, username, activation, sessions)
 * on target. Department scope alone is not enough when the target is more privileged than the
 * actor: system.manage holders, system-scope assignments, system roles, or role scopes that reach
 * outside the actor's staff.manage departments all require system.manage.
 */
const getTargetPrivilegeDenial = async (context, target) => {
  if (isSystemManager(context)) return null;
  const assignments = await db("staff_role_assignments as assignment")
    .join("roles as role", "role.id", "assignment.role_id")
    .where({ "assignment.staff_member_id": target.id, "assignment.is_active": 1, "role.is_active": 1 })
    .select("assignment.id", "assignment.scope_type", "assignment.department_id", "role.id as role_id", "role.is_system");
  if (!assignments.length) return null;
  if (assignments.some((assignment) => assignment.scope_type === "system" || assignment.is_system)) {
    return "Chỉ quản trị hệ thống được thao tác tài khoản có vai trò/phạm vi hệ thống";
  }
  const roleIds = [...new Set(assignments.map((assignment) => assignment.role_id))];
  const targetActions = await db("role_permissions as rp")
    .join("permission_actions as pa", "pa.name", "rp.action")
    .whereIn("rp.role_id", roleIds)
    .where("pa.is_active", 1)
    .pluck("rp.action");
  if (targetActions.includes(PERMISSIONS.SYSTEM_MANAGE)) {
    return "Chỉ quản trị hệ thống được thao tác tài khoản quản trị hệ thống";
  }
  const specificRows = await db("staff_role_assignment_departments")
    .whereIn("assignment_id", assignments.map((assignment) => assignment.id))
    .select("assignment_id", "department_id");
  const departments = assignments.some((assignment) => assignment.scope_type === "department_tree")
    ? await db("departments").where({ is_active: 1 }).select("id", "parent_id")
    : [];
  const reached = new Set();
  for (const assignment of assignments) {
    if (assignment.scope_type === "department" && assignment.department_id) reached.add(assignment.department_id);
    if (assignment.scope_type === "department_tree" && assignment.department_id) {
      reached.add(assignment.department_id);
      getDescendantDepartmentIds(departments, assignment.department_id).forEach((id) => reached.add(id));
    }
    if (assignment.scope_type === "specific_departments") {
      specificRows.filter((row) => row.assignment_id === assignment.id).forEach((row) => reached.add(row.department_id));
    }
  }
  if ([...reached].some((departmentId) => !canManageStaffDepartment(context, departmentId))) {
    return "Tài khoản này có phạm vi quyền vượt ngoài phạm vi quản lý của bạn";
  }
  return null;
};

const canManageTargetAccount = async (context, target) =>
  canManageStaff(context, target) && !(await getTargetPrivilegeDenial(context, target));

const ensureStaffDepartmentManageAccess = async (req, res, departmentId) => {
  const context = await loadContext(req);
  if (!canManageStaffDepartment(context, departmentId)) {
    res.status(403).json({ message: "Bạn không có quyền quản lý nhân sự trong đơn vị này" });
    return false;
  }
  return true;
};

// Account-level fields of PATCH /staff-members/:id that require the stronger target check.
const SENSITIVE_ACCOUNT_FIELDS = ["password", "username", "isActive", "mustChangePassword"];

const ensureAccountMutationAllowed = async (req, res, target, body = {}) => {
  if (!SENSITIVE_ACCOUNT_FIELDS.some((field) => body[field] !== undefined)) return true;
  const context = await loadContext(req);
  const denial = await getTargetPrivilegeDenial(context, target);
  if (denial) {
    res.status(403).json({ message: denial });
    return false;
  }
  return true;
};

const ensureRoleAssignmentMutationAllowed = async (req, res, staffMemberId, body, assignmentId = null) => {
  const context = await loadContext(req);
  if (!permissionsService.can(context, PERMISSIONS.STAFF_MANAGE)) {
    res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
    return false;
  }

  const staff = await db("staff_members").where({ id: staffMemberId }).first();
  if (!staff) {
    res.status(404).json({ message: "Không tìm thấy cán bộ tương ứng" });
    return false;
  }

  if (!canManageStaff(context, staff)) {
    res.status(403).json({ message: "Bạn không có quyền quản lý cán bộ này" });
    return false;
  }

  if (!isSystemManager(context) && staffMemberId === req.user.id) {
    res.status(403).json({ message: "Bạn không thể tự gán hoặc thay đổi vai trò của chính mình" });
    return false;
  }

  // Update/disable: the actor must also be allowed to manage the assignment as it is today.
  const current = await getCurrentAssignment(staffMemberId, assignmentId);
  if (current) {
    const currentDenial = await checkDraft(context, current);
    if (currentDenial) {
      res.status(403).json({ message: currentDenial });
      return false;
    }
  }

  const denial = await checkDraft(context, buildDraft(current, body));
  if (denial) {
    res.status(403).json({ message: denial });
    return false;
  }
  return true;
};

const ensureRoleAssignmentDraftAllowed = async (req, res, body) => {
  const context = await loadContext(req);
  const denial = await checkDraft(context, buildDraft(null, body));
  if (denial) {
    res.status(403).json({ message: denial });
    return false;
  }
  return true;
};

const ensureInitialRoleAssignmentsAllowed = async (req, res, roleAssignments = []) => {
  if (!Array.isArray(roleAssignments)) return true;
  for (const assignment of roleAssignments) {
    if (!(await ensureRoleAssignmentDraftAllowed(req, res, assignment))) return false;
  }
  return true;
};

const getStaffVisibleDepartmentIds = (context) => ({
  hasViewAll: permissionsService.hasSystemScopeForAction(context, PERMISSIONS.STAFF_VIEW),
  departmentIds: permissionsService.getAccessibleDepartmentIds(context, PERMISSIONS.STAFF_VIEW),
});

module.exports = {
  canGrantTreeScope,
  canManageStaff,
  canManageStaffDepartment,
  canManageTargetAccount,
  canViewStaff,
  ensureAccountMutationAllowed,
  ensureInitialRoleAssignmentsAllowed,
  ensureRoleAssignmentMutationAllowed,
  ensureStaffDepartmentManageAccess,
  getAssignmentDraftDenial,
  getStaffVisibleDepartmentIds,
  getTargetPrivilegeDenial,
};
