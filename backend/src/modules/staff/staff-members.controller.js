const permissionsService = require("../../services/permissions.service");
const { PERMISSIONS } = require("../../constants/permissions");
const staffMembersService = require("./staff-members.service");
const staffPolicy = require("./staff-members.policy");
const { auditLog } = require("../../utils/audit-log");

const ensureStaffManagePermission = async (req, res) => {
  const context = req.permissionContext || await permissionsService.getUserPermissionContext(req.user.id);
  if (!permissionsService.can(context, PERMISSIONS.STAFF_MANAGE)) {
    res.status(403).json({ message: "Bạn không có quyền thực hiện thao tác này" });
    return false;
  }
  return true;
};

const getPermissionContext = async (req) =>
  req.permissionContext || permissionsService.getUserPermissionContext(req.user.id);

const listStaffMembers = async (req, res, next) => {
  try {
    const context = await getPermissionContext(req);
    const visibleScope = staffPolicy.getStaffVisibleDepartmentIds(context);
    return res.json(await staffMembersService.listStaffMembers({ query: req.query, visibleScope }));
  } catch (error) {
    return next(error);
  }
};

const getStaffMember = async (req, res, next) => {
  try {
    const staff = await staffMembersService.getStaffById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: "Không tìm thấy cán bộ tương ứng" });
    }

    const context = await getPermissionContext(req);
    if (!staffPolicy.canViewStaff(context, staff)) {
      return res.status(403).json({ message: "Bạn không có quyền xem cán bộ này" });
    }

    return res.json(await staffMembersService.getStaffMember(req.params.id));
  } catch (error) {
    return next(error);
  }
};

const createStaffMember = async (req, res, next) => {
  try {
    if (!(await ensureStaffManagePermission(req, res))) return;
    await staffMembersService.validateCreateStaffBasics(req.body);
    if (!(await staffPolicy.ensureStaffDepartmentManageAccess(req, res, req.body.departmentId))) return;
    if (!(await staffPolicy.ensureInitialRoleAssignmentsAllowed(req, res, req.body.roleAssignments))) return;

    const staffMember = await staffMembersService.createStaffMember(req.body);
    auditLog(req, "info", {
      event: "staff_member_created",
      targetUserId: staffMember.id,
      departmentId: staffMember.departmentId,
      statusCode: 201,
    });
    return res.status(201).json(staffMember);
  } catch (error) {
    return next(error);
  }
};

const updateStaffMember = async (req, res, next) => {
  try {
    if (!(await ensureStaffManagePermission(req, res))) return;

    const current = await staffMembersService.getStaffById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: "Không tìm thấy cán bộ tương ứng" });
    }

    await staffMembersService.validateUpdateStaffBasics(req.body);
    if (!(await staffPolicy.ensureStaffDepartmentManageAccess(req, res, current.department_id))) return;
    if (!(await staffPolicy.ensureAccountMutationAllowed(req, res, current, req.body))) return;
    if (
      req.body.departmentId !== undefined &&
      !(await staffPolicy.ensureStaffDepartmentManageAccess(req, res, req.body.departmentId))
    ) return;

    const staffMember = await staffMembersService.updateStaffMember(req.params.id, req.body);
    auditLog(req, "info", {
      event: "staff_member_updated",
      targetUserId: req.params.id,
      departmentId: staffMember.departmentId,
      statusCode: 200,
    });
    return res.json(staffMember);
  } catch (error) {
    return next(error);
  }
};

const listRoleAssignments = async (req, res, next) => {
  try {
    const staff = await staffMembersService.getStaffById(req.params.id);
    if (!staff) {
      return res.status(404).json({ message: "Không tìm thấy cán bộ tương ứng" });
    }

    const context = await getPermissionContext(req);
    if (!staffPolicy.canViewStaff(context, staff)) {
      return res.status(403).json({ message: "Bạn không có quyền xem vai trò của cán bộ này" });
    }

    return res.json(await staffMembersService.listRoleAssignments(req.params.id));
  } catch (error) {
    return next(error);
  }
};

const createRoleAssignment = async (req, res, next) => {
  try {
    if (!(await staffPolicy.ensureRoleAssignmentMutationAllowed(req, res, req.params.id, req.body))) return;
    const assignment = await staffMembersService.createRoleAssignment(req.params.id, req.body);
    auditLog(req, "info", {
      event: "staff_role_assignment_created",
      targetUserId: req.params.id,
      assignmentId: assignment.id,
      roleId: assignment.roleId,
      statusCode: 201,
    });
    return res.status(201).json(assignment);
  } catch (error) {
    return next(error);
  }
};

const updateRoleAssignment = async (req, res, next) => {
  try {
    if (!(await staffPolicy.ensureRoleAssignmentMutationAllowed(req, res, req.params.id, req.body, req.params.assignmentId))) return;
    const assignment = await staffMembersService.updateRoleAssignment(
      req.params.id,
      req.params.assignmentId,
      req.body,
    );
    auditLog(req, "info", {
      event: "staff_role_assignment_updated",
      targetUserId: req.params.id,
      assignmentId: req.params.assignmentId,
      roleId: assignment.roleId,
      statusCode: 200,
    });
    return res.json(assignment);
  } catch (error) {
    return next(error);
  }
};

const disableRoleAssignment = async (req, res, next) => {
  try {
    if (!(await staffPolicy.ensureRoleAssignmentMutationAllowed(req, res, req.params.id, {}, req.params.assignmentId))) return;
    const assignment = await staffMembersService.disableRoleAssignment(req.params.id, req.params.assignmentId);
    auditLog(req, "warn", {
      event: "staff_role_assignment_disabled",
      targetUserId: req.params.id,
      assignmentId: req.params.assignmentId,
      statusCode: 200,
    });
    return res.json(assignment);
  } catch (error) {
    return next(error);
  }
};

const listAssignmentOptions = async (req, res, next) => {
  try {
    const context = await getPermissionContext(req);
    const { assignmentOptions } = require('./staff-assignment-options.service');
    return res.json(await assignmentOptions(context, req.query));
  } catch (error) { return next(error); }
};
module.exports = {
  listAssignmentOptions,
  createRoleAssignment,
  listStaffMembers,
  getStaffMember,
  createStaffMember,
  disableRoleAssignment,
  listRoleAssignments,
  updateStaffMember,
  updateRoleAssignment,
};
