const express = require('express');

const { PERMISSIONS } = require('../../constants/permissions');
const departmentsController = require('./departments.controller');
const { authenticate, requirePasswordReady, requirePermission } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticate, requirePasswordReady);

/**
 * GET /departments
 * Dùng để lấy danh sách đơn vị phẳng cho màn quản trị đơn vị.
 * Quyền: department.view. Scope: chỉ thấy đơn vị có department.view, trừ system scope/system.manage.
 * Query: q?, isActive?.
 * Success 200: Department[].
 * Fail: 401 chưa đăng nhập; 403 thiếu department.view.
 */
router.get('/', requirePermission(PERMISSIONS.DEPARTMENT_VIEW), departmentsController.listDepartments);

/**
 * GET /departments/tree
 * Dùng để lấy cây đơn vị cho màn quản trị đơn vị.
 * Quyền: department.view. Scope: chỉ thấy cây đơn vị nằm trong scope department.view.
 * Query: isActive?.
 * Success 200: DepartmentTree[].
 * Fail: 401 chưa đăng nhập; 403 thiếu department.view.
 */
router.get('/tree', requirePermission(PERMISSIONS.DEPARTMENT_VIEW), departmentsController.listDepartmentTree);

/**
 * GET /departments/:id
 * Dùng để lấy chi tiết một đơn vị.
 * Quyền: department.view trên đơn vị đó.
 * Params: id = department id.
 * Success 200: Department.
 * Fail: 401 chưa đăng nhập; 403 sai scope; 404 không tìm thấy đơn vị.
 */
router.get('/:id', requirePermission(PERMISSIONS.DEPARTMENT_VIEW), departmentsController.getDepartment);

/**
 * POST /departments
 * Dùng để tạo mới đơn vị.
 * Quyền: department.manage. Nếu tạo dưới parentId thì phải có department.manage trên parentId; tạo cấp gốc cần system scope department.manage/system.manage.
 * Body: { code, name, parentId?, type?, sortOrder?, description?, isActive? }.
 * Success 201: Department.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope; 422 thiếu code/name, parent/type không hợp lệ hoặc trùng code/name.
 */
router.post('/', requirePermission(PERMISSIONS.DEPARTMENT_MANAGE), departmentsController.createDepartment);

/**
 * PATCH /departments/:id
 * Dùng để cập nhật đơn vị.
 * Quyền: department.manage trên đơn vị cần sửa.
 * Params: id = department id.
 * Body: { code?, name?, parentId?, type?, sortOrder?, description?, isActive? }.
 * Success 200: Department.
 * Fail: 401 chưa đăng nhập; 403 thiếu quyền/sai scope; 404 không tìm thấy đơn vị; 422 dữ liệu không hợp lệ/trùng/tạo vòng cây.
 */
router.patch('/:id', requirePermission(PERMISSIONS.DEPARTMENT_MANAGE), departmentsController.updateDepartment);

module.exports = router;
