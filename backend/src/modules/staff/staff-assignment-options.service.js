const db = require('../../config/database');
const permissions = require('../../services/permissions.service');
const { PERMISSIONS } = require('../../constants/permissions');
const policy = require('./staff-members.policy');
const { fail } = require('../../utils/http-error');
const { containsPattern } = require('../../utils/sql-like');
const MAX_OPTIONS = 500;
const SCOPE_LABELS = { system: 'Toàn hệ thống', department: 'Một đơn vị', department_tree: 'Đơn vị và cấp dưới', specific_departments: 'Các đơn vị được chọn' };

// Use the same draft policy as writes; role level never grants permission.
const buildAssignmentOptions = (context, roles, rolePermissions, departments) => {
  const admin = permissions.can(context, PERMISSIONS.SYSTEM_MANAGE);
  const managed = departments.filter(department => policy.canManageStaffDepartment(context, department.id));
  const tree = managed.filter(department => policy.canGrantTreeScope(context, department.id));
  const scopes = [
    ...(admin ? [{ value: 'system', departmentIds: [] }] : []),
    ...(managed.length ? [{ value: 'department', departmentIds: managed.map(d => d.id) }] : []),
    ...(tree.length ? [{ value: 'department_tree', departmentIds: tree.map(d => d.id) }] : []),
    ...(managed.length ? [{ value: 'specific_departments', departmentIds: managed.map(d => d.id) }] : []),
  ].map(scope => ({ ...scope, label: SCOPE_LABELS[scope.value] }));
  const actions = new Map();
  for (const entry of rolePermissions) {
    if (!actions.has(entry.role_id)) actions.set(entry.role_id, []);
    actions.get(entry.role_id).push(entry.action);
  }
  const availableRoles = roles.filter(role => role.is_active !== 0 && !policy.getAssignmentDraftDenial(context, { scopeType: 'specific_departments', departmentIds: [] }, role, actions.get(role.id) || []));
  return {
    roles: scopes.length ? availableRoles.map(role => ({ id: role.id, name: role.name, label: role.label, level: role.level, isSystem: Boolean(role.is_system) })) : [],
    scopes,
    departments: managed.map(d => ({ id: d.id, name: d.name })),
    canAssignToSelf: admin,
  };
};
const assignmentOptions = async (context, query = {}) => {
  let search;
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.trim().length > 200) fail(422, 'Tìm vai trò phải là chuỗi tối đa 200 ký tự');
    search = query.q.trim();
  }
  const roleQuery = db('roles').where('is_active', 1).orderBy('level', 'desc').orderBy('id').limit(MAX_OPTIONS + 1);
  const admin = permissions.can(context, PERMISSIONS.SYSTEM_MANAGE);
  if (!admin) roleQuery.where('is_system', 0).whereNotExists(function () {
    this.select(1).from('role_permissions as candidate').join('permission_actions as action', 'action.name', 'candidate.action').whereColumn('candidate.role_id', 'roles.id').where('action.is_active', 1).whereNotIn('candidate.action', context.permissions || []);
  });
  const departmentQuery = db('departments').where('is_active', 1).orderBy('name').orderBy('id').limit(MAX_OPTIONS + 1);
  if (!permissions.hasSystemScopeForAction(context, PERMISSIONS.STAFF_MANAGE)) departmentQuery.whereIn('id', permissions.getAccessibleDepartmentIds(context, PERMISSIONS.STAFF_MANAGE));
  if (search) roleQuery.where(function () { this.where('label', 'like', containsPattern(search)).orWhere('name', 'like', containsPattern(search)); });
  const [roles, departments] = await Promise.all([
    roleQuery.select('id', 'name', 'label', 'level', 'is_system', 'is_active'),
    departmentQuery.select('id', 'name'),
  ]);
  const roleIds = roles.slice(0, MAX_OPTIONS).map(role => role.id);
  const rolePermissions = roleIds.length ? await db('role_permissions as rp').join('permission_actions as pa', 'pa.name', 'rp.action').whereIn('rp.role_id', roleIds).where('pa.is_active', 1).select('rp.role_id', 'rp.action') : [];
  return { ...buildAssignmentOptions(context, roles.slice(0, MAX_OPTIONS), rolePermissions, departments.slice(0, MAX_OPTIONS)), truncated: roles.length > MAX_OPTIONS || departments.length > MAX_OPTIONS };
};
module.exports = { assignmentOptions, buildAssignmentOptions };
