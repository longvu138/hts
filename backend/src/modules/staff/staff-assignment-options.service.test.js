const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAssignmentOptions, assignmentOptions } = require('./staff-assignment-options.service');
const context = (scopeType, permissions = ['staff.view', 'staff.manage']) => ({ permissions, permissionScopes: permissions.map(action => ({ action, scopeType, departmentId: 'd1', departmentIds: ['d1', ...(scopeType === 'department_tree' ? ['d2'] : [])] })) });
const roles = [{ id: 'ordinary', label: 'Cán bộ', is_system: 0, is_active: 1 }, { id: 'admin', is_system: 1, is_active: 1 }, { id: 'extra', is_system: 0, is_active: 1 }, { id: 'inactive', is_active: 0 }];
const rolePermissions = [{ role_id: 'ordinary', action: 'staff.view' }, { role_id: 'admin', action: 'system.manage' }, { role_id: 'extra', action: 'work.assign' }];
const departments = [{ id: 'd1', name: 'Phòng 1' }, { id: 'd2', name: 'Phòng 2' }, { id: 'outside', name: 'Ngoài phạm vi' }];
test('quản lý đơn vị chỉ nhận vai trò và phạm vi được phép gán', () => {
  const result = buildAssignmentOptions(context('department'), roles, rolePermissions, departments);
  assert.deepEqual(result.roles.map(role => role.id), ['ordinary']);
  assert.deepEqual(result.scopes.map(scope => scope.value), ['department', 'specific_departments']);
  assert.deepEqual(result.departments.map(department => department.id), ['d1']);
  assert.equal(result.canAssignToSelf, false);
});
test('quản lý cây được chọn các đơn vị trong cây, không có phạm vi hệ thống', () => {
  const result = buildAssignmentOptions(context('department_tree'), roles, rolePermissions, departments);
  assert.deepEqual(result.scopes.find(scope => scope.value === 'department_tree').departmentIds, ['d1', 'd2']);
  assert.equal(result.scopes.some(scope => scope.value === 'system'), false);
});
test('quản trị hệ thống nhận mọi vai trò đang hoạt động và phạm vi', () => {
  const result = buildAssignmentOptions(context('system', ['system.manage']), roles, rolePermissions, departments);
  assert.equal(result.roles.length, 3); assert.equal(result.canAssignToSelf, true);
  assert.deepEqual(result.scopes.map(scope => scope.value), ['system', 'department', 'department_tree', 'specific_departments']);
});
test('từ chối dữ liệu tìm vai trò sai trước khi truy vấn DB', async () => {
  await assert.rejects(assignmentOptions(context('department'), { q: ['invalid'] }), error => error.statusCode === 422);
});
