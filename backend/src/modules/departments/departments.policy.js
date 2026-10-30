const { PERMISSIONS } = require("../../constants/permissions");
const permissionsService = require("../../services/permissions.service");

const canViewDepartment = (context, departmentId) =>
  permissionsService.canAccessDepartmentForAction(context, PERMISSIONS.DEPARTMENT_VIEW, departmentId);

const canManageDepartment = (context, departmentId = null) =>
  departmentId
    ? permissionsService.canAccessDepartmentForAction(context, PERMISSIONS.DEPARTMENT_MANAGE, departmentId)
    : permissionsService.hasSystemScopeForAction(context, PERMISSIONS.DEPARTMENT_MANAGE);

const ensureDepartmentManagePermission = async (req, res, departmentId = null) => {
  const context = req.permissionContext || await permissionsService.getUserPermissionContext(req.user.id);
  if (!canManageDepartment(context, departmentId)) {
    res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
    return false;
  }
  return true;
};

const getDepartmentVisibleScope = (context) => ({
  hasViewAll: permissionsService.hasSystemScopeForAction(context, PERMISSIONS.DEPARTMENT_VIEW),
  departmentIds: permissionsService.getAccessibleDepartmentIds(context, PERMISSIONS.DEPARTMENT_VIEW),
});

module.exports = {
  canManageDepartment,
  canViewDepartment,
  ensureDepartmentManagePermission,
  getDepartmentVisibleScope,
};
