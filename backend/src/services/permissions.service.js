const db = require("../config/database");
const { PERMISSIONS } = require("../constants/permissions");
const roleAssignmentsService = require("./role-assignments.service");
const { getDescendantDepartmentIds } = require("./org.service");

const PERMISSION_CONTEXT_TTL_MS = Number(process.env.PERMISSION_CONTEXT_TTL_MS || 5000);
const permissionContextCache = new Map();

const unique = (items) => [...new Set(items.filter(Boolean))];

const cloneContext = (context) => {
  if (!context) return context;
  return {
    ...context,
    roleNames: [...context.roleNames],
    roleAssignments: context.roleAssignments.map((assignment) => ({
      ...assignment,
      departmentIds: Array.isArray(assignment.departmentIds)
        ? [...assignment.departmentIds]
        : [],
    })),
    permissions: [...context.permissions],
    permissionScopes: context.permissionScopes.map((scope) => ({
      ...scope,
      departmentIds: Array.isArray(scope.departmentIds) ? [...scope.departmentIds] : [],
    })),
    managedDepartmentIds: [...context.managedDepartmentIds],
  };
};

const invalidatePermissionCache = (userId = null) => {
  if (userId) {
    permissionContextCache.delete(userId);
    return;
  }
  permissionContextCache.clear();
};

const getAssignmentRoleNames = (assignments = []) =>
  unique(assignments.filter((a) => a.isActive).map((a) => a.roleName));

/**
 * Get permissions for a list of role ids by querying DB role_permissions.
 */
const getPermissionsForRoleIds = async (roleIds = []) => {
  if (!roleIds.length) return [];
  return db("role_permissions as rp")
    .join("roles as r", "r.id", "rp.role_id")
    .join("permission_actions as pa", "pa.name", "rp.action")
    .whereIn("r.id", roleIds)
    .where("r.is_active", 1)
    .where("pa.is_active", 1)
    .select("rp.role_id", "rp.action");
};

const getDepartmentScopeIds = (assignment, departments = []) => {
  if (assignment.scopeType === "department" && assignment.departmentId) {
    return [assignment.departmentId];
  }
  if (assignment.scopeType === "department_tree" && assignment.departmentId) {
    return [
      assignment.departmentId,
      ...getDescendantDepartmentIds(departments, assignment.departmentId),
    ];
  }
  if (assignment.scopeType === "specific_departments") {
    return assignment.departmentIds || [];
  }
  return [];
};

const buildPermissionScopes = (assignments = [], rolePermissionRows = [], departments = []) => {
  const actionsByRole = rolePermissionRows.reduce((grouped, row) => {
    grouped[row.role_id] = grouped[row.role_id] || [];
    grouped[row.role_id].push(row.action);
    return grouped;
  }, {});

  return assignments
    .filter((assignment) => assignment.isActive)
    .flatMap((assignment) =>
      unique(actionsByRole[assignment.roleId] || []).map((action) => ({
        action,
        roleId: assignment.roleId,
        roleName: assignment.roleName,
        scopeType: assignment.scopeType,
        departmentId: assignment.departmentId,
        departmentIds: getDepartmentScopeIds(assignment, departments),
      })),
    );
};

const buildUserPermissionContext = async (userId) => {
  const user = await db("staff_members").where({ id: userId }).first();
  if (!user || !user.is_active) return null;

  const roleAssignments = await roleAssignmentsService.listAssignments(user.id);
  const activeDepartments = await db("departments").where({ is_active: 1 }).select("id", "parent_id");
  const assignmentRoleNames = getAssignmentRoleNames(roleAssignments);
  const assignmentRoleIds = unique(
    roleAssignments.filter((a) => a.isActive).map((a) => a.roleId),
  );
  const roleNames = assignmentRoleNames;
  const rolePermissionRows = await getPermissionsForRoleIds(assignmentRoleIds);
  const permissions = unique(rolePermissionRows.map((r) => r.action));
  const permissionScopes = buildPermissionScopes(roleAssignments, rolePermissionRows, activeDepartments);
  const managedDepartmentIds = await roleAssignmentsService.getManagedDepartmentIds(user.id, {
    assignments: roleAssignments,
    departments: activeDepartments,
  });
  const hasSystemScope = roleAssignments.some((a) => a.isActive && a.scopeType === "system");
  const hasSystemManage = permissions.includes(PERMISSIONS.SYSTEM_MANAGE);

  return {
    userId: user.id,
    roleNames,
    roleAssignments,
    permissions,
    permissionScopes,
    managedDepartmentIds,
    isSystemManager: hasSystemManage,
    isSystemWide: hasSystemScope || hasSystemManage,
  };
};

const getUserPermissionContext = async (userId, options = {}) => {
  if (!userId) return null;
  if (options.skipCache || PERMISSION_CONTEXT_TTL_MS <= 0) {
    return buildUserPermissionContext(userId);
  }

  const now = Date.now();
  const cached = permissionContextCache.get(userId);
  if (cached && cached.expiresAt > now) return cloneContext(cached.context);

  const context = await buildUserPermissionContext(userId);
  permissionContextCache.set(userId, {
    context: cloneContext(context),
    expiresAt: now + PERMISSION_CONTEXT_TTL_MS,
  });
  return cloneContext(context);
};

const can = (userContext, action, resource = null) => {
  void resource;
  if (!userContext || !action) return false;
  if (userContext.permissions.includes(PERMISSIONS.SYSTEM_MANAGE)) return true;
  return userContext.permissions.includes(action);
};

const canManageDepartment = (userContext, departmentId) => {
  if (!userContext) return false;
  if (can(userContext, PERMISSIONS.SYSTEM_MANAGE)) return true;
  if (userContext.isSystemWide) return true;
  if (!departmentId) return false;
  return userContext.managedDepartmentIds.includes(departmentId);
};

const hasSystemScopeForAction = (userContext, action) => {
  if (can(userContext, PERMISSIONS.SYSTEM_MANAGE)) return true;
  return Boolean(
    action &&
      userContext?.permissionScopes?.some(
        (scope) => scope.action === action && scope.scopeType === "system",
      ),
  );
};

const getAccessibleDepartmentIds = (userContext, action) => {
  if (!userContext || !action) return [];
  if (hasSystemScopeForAction(userContext, action)) {
    return [...(userContext.managedDepartmentIds || [])];
  }
  const ids = new Set();
  (userContext.permissionScopes || [])
    .filter((scope) => scope.action === action)
    .forEach((scope) => {
      (scope.departmentIds || []).forEach((departmentId) => ids.add(departmentId));
    });
  return [...ids];
};

const canAccessDepartmentForAction = (userContext, action, departmentId) => {
  if (!departmentId) return false;
  if (!can(userContext, action)) return false;
  if (hasSystemScopeForAction(userContext, action)) return true;
  return getAccessibleDepartmentIds(userContext, action).includes(departmentId);
};

const getPublicPermissions = async (userId) => {
  const context = await getUserPermissionContext(userId);
  return context?.permissions || [];
};

module.exports = {
  can,
  canAccessDepartmentForAction,
  canManageDepartment,
  getAccessibleDepartmentIds,
  getPublicPermissions,
  getUserPermissionContext,
  hasSystemScopeForAction,
  invalidatePermissionCache,
};
