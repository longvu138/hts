const { PERMISSIONS } = require("../../constants/permissions");
const permissionsService = require("../../services/permissions.service");
const rolesService = require("./roles.service");
const { auditLog } = require("../../utils/audit-log");

// Route already requires system.manage; re-check with a fresh context for every mutation.
const ensureSystemManager = async (req, res) => {
  const context = await permissionsService.getUserPermissionContext(req.user.id);
  if (!permissionsService.can(context, PERMISSIONS.SYSTEM_MANAGE)) {
    res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
    return false;
  }
  return true;
};

const listActions = async (req, res, next) => {
  try {
    return res.json(await rolesService.listActions());
  } catch (error) {
    return next(error);
  }
};

const createAction = async (req, res, next) => {
  try {
    if (!(await ensureSystemManager(req, res))) return;
    const action = await rolesService.createAction(req.body);
    auditLog(req, "warn", { event: "permission_action_created", action: action.name, statusCode: 201 });
    return res.status(201).json(action);
  } catch (error) {
    return next(error);
  }
};

const updateAction = async (req, res, next) => {
  try {
    if (!(await ensureSystemManager(req, res))) return;
    const action = await rolesService.updateAction(req.params.name, req.body);
    auditLog(req, "warn", { event: "permission_action_updated", action: req.params.name, statusCode: 200 });
    return res.json(action);
  } catch (error) {
    return next(error);
  }
};

const listRoles = async (req, res, next) => {
  try {
    return res.json(await rolesService.listRoles());
  } catch (error) {
    return next(error);
  }
};

const createRole = async (req, res, next) => {
  try {
    if (!(await ensureSystemManager(req, res))) return;
    const role = await rolesService.createRole(req.body);
    auditLog(req, "warn", { event: "role_created", roleId: role.id, roleName: role.name, statusCode: 201 });
    return res.status(201).json(role);
  } catch (error) {
    return next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    if (!(await ensureSystemManager(req, res))) return;
    const role = await rolesService.updateRole(req.params.id, req.body);
    auditLog(req, "warn", { event: "role_updated", roleId: req.params.id, roleName: role.name, statusCode: 200 });
    return res.json(role);
  } catch (error) {
    return next(error);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    if (!(await ensureSystemManager(req, res))) return;
    const role = await rolesService.disableRole(req.params.id);
    auditLog(req, "warn", { event: "role_disabled", roleId: req.params.id, roleName: role.name, statusCode: 200 });
    return res.json({ message: "Đã tắt vai trò" });
  } catch (error) {
    return next(error);
  }
};

const getRolePermissions = async (req, res, next) => {
  try {
    return res.json(await rolesService.getRolePermissions(req.params.id));
  } catch (error) {
    return next(error);
  }
};

const getRolePermissionsMatrix = async (req, res, next) => {
  try {
    return res.json(await rolesService.getRolePermissionsMatrix());
  } catch (error) {
    return next(error);
  }
};

const updateRolePermissions = async (req, res, next) => {
  try {
    if (!(await ensureSystemManager(req, res))) return;
    const { role, actions } = await rolesService.replaceRolePermissions(req.params.id, req.body);
    auditLog(req, "warn", {
      event: "role_permissions_updated",
      roleId: req.params.id,
      roleName: role.name,
      actionCount: actions.length,
      statusCode: 200,
    });
    return res.json(actions);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createAction,
  createRole,
  deleteRole,
  getRolePermissionsMatrix,
  getRolePermissions,
  listActions,
  listRoles,
  updateAction,
  updateRole,
  updateRolePermissions,
};
