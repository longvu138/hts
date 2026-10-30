const { randomUUID } = require("crypto");
const db = require("../../config/database");
const permissionsService = require("../../services/permissions.service");
const { withAdminSafetyMutation } = require("../../services/admin-safety.service");
const { httpError } = require("../../utils/http-error");
const { validateRolePermissions } = require("./role-permissions.validator");

// Reference lists are returned whole (no pagination) but capped to protect memory.
const REFERENCE_LIST_LIMIT = 500;

const mapAction = (row) => ({
  name: row.name,
  label: row.label,
  groupName: row.group_name,
  description: row.description || null,
  sortOrder: row.sort_order,
  isActive: Boolean(row.is_active),
});

const mapRole = (row) => ({
  id: row.id,
  name: row.name,
  label: row.label || row.name,
  level: row.level,
  isSystem: Boolean(row.is_system),
  isActive: Boolean(row.is_active),
});

// ─── Permission actions ─────────────────────────────────────────────────────

const listActions = async () => {
  const rows = await db("permission_actions").orderBy("sort_order").orderBy("name").limit(REFERENCE_LIST_LIMIT);
  return rows.map(mapAction);
};

const createAction = async (body = {}) => {
  const { name, label, groupName, description, sortOrder } = body;
  if (!name || !label || !groupName) throw httpError(422, "name, label và groupName là bắt buộc");
  // name must be slug-like: letters, digits, dots, underscores only
  if (!/^[a-z0-9_.]+$/.test(name)) throw httpError(422, "name chỉ được chứa chữ thường, số, dấu chấm và gạch dưới");
  const existing = await db("permission_actions").where({ name }).first();
  if (existing) throw httpError(422, "Action name đã tồn tại");
  await db("permission_actions").insert({
    name,
    label,
    group_name: groupName,
    description: description || null,
    sort_order: sortOrder ?? 99,
    is_active: 1,
  });
  permissionsService.invalidatePermissionCache();
  return mapAction(await db("permission_actions").where({ name }).first());
};

const updateAction = async (name, body = {}) => {
  const existing = await db("permission_actions").where({ name }).first();
  if (!existing) throw httpError(404, "Không tìm thấy action");

  const update = {};
  if (body.label !== undefined) update.label = body.label;
  if (body.groupName !== undefined) update.group_name = body.groupName;
  if (body.description !== undefined) update.description = body.description;
  if (body.sortOrder !== undefined) update.sort_order = body.sortOrder;
  if (body.isActive !== undefined) update.is_active = body.isActive ? 1 : 0;

  await withAdminSafetyMutation((trx) => trx("permission_actions").where({ name }).update({ ...update, updated_at: trx.fn.now() }));
  permissionsService.invalidatePermissionCache();
  return mapAction(await db("permission_actions").where({ name }).first());
};

// ─── Roles ──────────────────────────────────────────────────────────────────

const listRoles = async () => {
  const rows = await db("roles").where({ is_active: 1 }).orderBy("level", "desc").orderBy("name").limit(REFERENCE_LIST_LIMIT);
  return rows.map(mapRole);
};

const createRole = async (body = {}) => {
  const { name, label, level } = body;
  if (!name || !label) throw httpError(422, "name và label là bắt buộc");
  if (!/^[a-z0-9_]+$/.test(name)) throw httpError(422, "name chỉ được chứa chữ thường, số và gạch dưới");
  const existing = await db("roles").where({ name }).first();
  if (existing) throw httpError(422, "Tên role đã tồn tại");
  const id = randomUUID();
  await db("roles").insert({ id, name, label, level: level ?? 10, is_system: 0, is_active: 1 });
  permissionsService.invalidatePermissionCache();
  return mapRole(await db("roles").where({ id }).first());
};

const getRoleOrFail = async (roleId) => {
  const role = await db("roles").where({ id: roleId }).first();
  if (!role) throw httpError(404, "Không tìm thấy vai trò");
  return role;
};

const updateRole = async (roleId, body = {}) => {
  const existing = await getRoleOrFail(roleId);
  const update = {};
  if (body.label !== undefined) update.label = body.label;
  if (body.level !== undefined) update.level = body.level;
  if (body.isActive !== undefined) {
    if (existing.is_system && !body.isActive) throw httpError(422, "Không thể tắt vai trò hệ thống");
    update.is_active = body.isActive ? 1 : 0;
  }
  await withAdminSafetyMutation((trx) => trx("roles").where({ id: roleId }).update({ ...update, updated_at: trx.fn.now() }));
  permissionsService.invalidatePermissionCache();
  return mapRole(await db("roles").where({ id: roleId }).first());
};

const disableRole = async (roleId) => {
  const existing = await getRoleOrFail(roleId);
  if (existing.is_system) throw httpError(422, "Không thể tắt vai trò hệ thống");
  // Soft-delete: set is_active = 0
  await withAdminSafetyMutation((trx) => trx("roles").where({ id: roleId }).update({ is_active: 0, updated_at: trx.fn.now() }));
  permissionsService.invalidatePermissionCache();
  return mapRole(existing);
};

// ─── Role ↔ permissions matrix ──────────────────────────────────────────────

const getRolePermissions = async (roleId) => {
  await getRoleOrFail(roleId);
  const rows = await db("role_permissions").where({ role_id: roleId }).select("action");
  return rows.map((row) => row.action);
};

const getRolePermissionsMatrix = async () => {
  const rows = await db("role_permissions as rp")
    .join("roles as r", "r.id", "rp.role_id")
    .join("permission_actions as pa", "pa.name", "rp.action")
    .where("r.is_active", 1)
    .where("pa.is_active", 1)
    .select("rp.role_id", "rp.action");
  return rows.reduce((grouped, row) => {
    grouped[row.role_id] = grouped[row.role_id] || [];
    grouped[row.role_id].push(row.action);
    return grouped;
  }, {});
};

const replaceRolePermissions = async (roleId, body) => {
  const role = await getRoleOrFail(roleId);
  const actions = validateRolePermissions(body);
  if (actions.length > 0) {
    const validActions = await db("permission_actions").whereIn("name", actions).where("is_active", 1).pluck("name");
    const invalid = actions.filter((action) => !validActions.includes(action));
    if (invalid.length > 0) throw httpError(422, `Action không hợp lệ: ${invalid.join(", ")}`);
  }
  await withAdminSafetyMutation(async (trx) => {
    await trx("role_permissions").where({ role_id: roleId }).delete();
    if (actions.length > 0) {
      await trx("role_permissions").insert(actions.map((action) => ({ role_id: roleId, action })));
    }
  });
  permissionsService.invalidatePermissionCache();
  return { role, actions: await db("role_permissions").where({ role_id: roleId }).pluck("action") };
};

module.exports = {
  REFERENCE_LIST_LIMIT,
  createAction,
  createRole,
  disableRole,
  getRolePermissions,
  getRolePermissionsMatrix,
  listActions,
  listRoles,
  replaceRolePermissions,
  updateAction,
  updateRole,
};
