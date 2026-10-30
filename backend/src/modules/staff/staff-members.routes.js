const express = require('express');

const { PERMISSIONS } = require('../../constants/permissions');
const staffMembersController = require('./staff-members.controller');
const { authenticate, requirePasswordReady, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requirePasswordReady);

/**
 * GET /staff-members
 * Dùng để lấy danh sách cán bộ cho màn quản trị nhân sự.
 * Quyền: staff.view. Scope: chỉ thấy cán bộ thuộc đơn vị có staff.view, trừ system scope/system.manage.
 * Query: q?, departmentId?, role?, isActive?, page?, limit? (limit tối đa 100).
 * Success 200: { staffMembers, pagination } kèm roleAssignments cho từng cán bộ.
 * Fail: 401 chưa đăng nhập; 403 thiếu staff.view.
 */
router.get('/', requirePermission(PERMISSIONS.STAFF_VIEW), staffMembersController.listStaffMembers);

// Read-only choices for granting roles; must precede /:id.
router.get('/assignment-options', requirePermission(PERMISSIONS.STAFF_MANAGE), staffMembersController.listAssignmentOptions);

/**
 * GET /staff-members/:id
 * Dùng để lấy chi tiết một cán bộ.
 * Quyền: staff.view và scope staff.view phải bao phủ phòng ban của cán bộ.
 * Params: id = staff member id.
 * Success 200: StaffMember kèm roleAssignments.
 * Fail: 401 chưa đăng nhập; 403 sai scope; 404 không tìm thấy cán bộ.
 */
router.get('/:id', requirePermission(PERMISSIONS.STAFF_VIEW), staffMembersController.getStaffMember);

/**
 * GET /staff-members/:id/role-assignments
 * Dùng để lấy danh sách role assignment của một cán bộ.
 * Quyền: staff.view và scope staff.view phải bao phủ phòng ban của cán bộ.
 * Params: id = staff member id.
 * Success 200: RoleAssignment[].
 * Fail: 401 chưa đăng nhập; 403 sai scope; 404 không tìm thấy cán bộ.
 */
router.get('/:id/role-assignments', requirePermission(PERMISSIONS.STAFF_VIEW), staffMembersController.listRoleAssignments);

/**
 * POST /staff-members
 * Dùng để tạo mới cán bộ/tài khoản nhân sự.
 * Quyền: staff.manage, scope staff.manage phải bao phủ departmentId nếu có.
 * Body: { code, username, fullName, position?, departmentId?, email?, phone?, role?, isActive?, password?, mustChangePassword? }.
 * Success 201: StaffMember.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope; 422 thiếu code/username/fullName, department không tồn tại hoặc trùng code/username/email.
 */
router.post('/', requirePermission(PERMISSIONS.STAFF_MANAGE), staffMembersController.createStaffMember);

/**
 * POST /staff-members/:id/role-assignments
 * Dùng để gán role động cho cán bộ.
 * Quyền: staff.manage. Nếu gán role/scope hệ thống hoặc role có system.manage thì người thao tác phải có system.manage.
 * Params: id = staff member id.
 * Body: { roleId, scopeType?, departmentId?, departmentIds?, isActive? }.
 * Success 201: RoleAssignment.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope/nâng quyền hệ thống; 404 không tìm thấy cán bộ; 422 payload không hợp lệ.
 */
router.post('/:id/role-assignments', requirePermission(PERMISSIONS.STAFF_MANAGE), staffMembersController.createRoleAssignment);

/**
 * PATCH /staff-members/:id
 * Dùng để cập nhật thông tin cán bộ.
 * Quyền: staff.manage, scope phải bao phủ phòng ban hiện tại và departmentId mới nếu đổi phòng.
 * Params: id = staff member id.
 * Body: { code?, username?, fullName?, position?, departmentId?, email?, phone?, role?, isActive?, password?, mustChangePassword? }.
 * Success 200: StaffMember.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope; 404 không tìm thấy cán bộ; 422 dữ liệu không hợp lệ/trùng.
 */
router.patch('/:id', requirePermission(PERMISSIONS.STAFF_MANAGE), staffMembersController.updateStaffMember);

/**
 * PATCH /staff-members/:id/role-assignments/:assignmentId
 * Dùng để cập nhật role assignment của cán bộ.
 * Quyền: staff.manage; yêu cầu system.manage nếu update sang role/scope hệ thống.
 * Params: id = staff member id, assignmentId = role assignment id.
 * Body: { roleId?, scopeType?, departmentId?, departmentIds?, isActive? }.
 * Success 200: RoleAssignment.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope/nâng quyền hệ thống; 404 không tìm thấy assignment; 422 payload không hợp lệ.
 */
router.patch('/:id/role-assignments/:assignmentId', requirePermission(PERMISSIONS.STAFF_MANAGE), staffMembersController.updateRoleAssignment);

/**
 * DELETE /staff-members/:id/role-assignments/:assignmentId
 * Dùng để tắt role assignment của cán bộ (soft disable is_active = 0).
 * Quyền: staff.manage; yêu cầu system.manage nếu assignment là role/scope hệ thống.
 * Params: id = staff member id, assignmentId = role assignment id.
 * Success 200: { message }.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope; 404 không tìm thấy assignment.
 */
router.delete('/:id/role-assignments/:assignmentId', requirePermission(PERMISSIONS.STAFF_MANAGE), staffMembersController.disableRoleAssignment);

module.exports = router;
