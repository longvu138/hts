const permissionsService = require("../../services/permissions.service");
const departmentsService = require("./departments.service");
const departmentsPolicy = require("./departments.policy");
const { auditLog } = require("../../utils/audit-log");

const getPermissionContext = async (req) =>
  req.permissionContext || permissionsService.getUserPermissionContext(req.user.id);

const listDepartments = async (req, res, next) => {
  try {
    const context = await getPermissionContext(req);
    const visibleScope = departmentsPolicy.getDepartmentVisibleScope(context);
    return res.json(await departmentsService.listDepartments({ query: req.query, visibleScope }));
  } catch (error) {
    return next(error);
  }
};

const listDepartmentTree = async (req, res, next) => {
  try {
    const context = await getPermissionContext(req);
    const visibleScope = departmentsPolicy.getDepartmentVisibleScope(context);
    return res.json(await departmentsService.listDepartmentTree({ query: req.query, visibleScope }));
  } catch (error) {
    return next(error);
  }
};

const getDepartment = async (req, res, next) => {
  try {
    const department = await departmentsService.getDepartmentById(req.params.id);
    if (!department) {
      return res.status(404).json({ message: "Không tìm thấy phòng ban tương ứng" });
    }

    const context = await getPermissionContext(req);
    if (!departmentsPolicy.canViewDepartment(context, department.id)) {
      return res.status(403).json({ message: "Bạn không có quyền xem phòng ban này" });
    }

    return res.json(await departmentsService.getDepartment(req.params.id));
  } catch (error) {
    return next(error);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    if (!(await departmentsPolicy.ensureDepartmentManagePermission(req, res, req.body.parentId || null))) return;
    const department = await departmentsService.createDepartment(req.body);
    auditLog(req, "info", {
      event: "department_created",
      departmentId: department.id,
      parentId: department.parentId,
      statusCode: 201,
    });
    return res.status(201).json(department);
  } catch (error) {
    return next(error);
  }
};

const updateDepartment = async (req, res, next) => {
  try {
    if (!(await departmentsPolicy.ensureDepartmentManagePermission(req, res, req.params.id))) return;
    const current = await departmentsService.getDepartmentById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: "Không tìm thấy phòng ban tương ứng" });
    }
    // Moving a department also needs manage rights on the new parent; moving to the root
    // (parentId null) needs system scope, like creating a root department.
    if (req.body.parentId !== undefined && (req.body.parentId || null) !== (current.parent_id || null)) {
      if (!(await departmentsPolicy.ensureDepartmentManagePermission(req, res, req.body.parentId || null))) return;
    }

    const department = await departmentsService.updateDepartment(req.params.id, req.body);
    auditLog(req, "info", {
      event: "department_updated",
      departmentId: req.params.id,
      statusCode: 200,
    });
    return res.json(department);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listDepartments,
  listDepartmentTree,
  getDepartment,
  createDepartment,
  updateDepartment,
};
