const test = require("node:test");
const assert = require("node:assert/strict");
const { getAssignmentDraftDenial } = require("./staff-members.policy");

// Department-scoped staff manager of d1 holding staff.view + staff.manage only.
const context = (scopes, permissions = ["staff.view", "staff.manage"]) => ({
  permissions,
  permissionScopes: scopes.flatMap((scope) => permissions.map((action) => ({ action, ...scope }))),
});
const deptManager = context([{ scopeType: "department", departmentId: "d1", departmentIds: ["d1"] }]);
const treeManager = context([{ scopeType: "department_tree", departmentId: "d1", departmentIds: ["d1", "d2"] }]);
const role = { id: "r", is_system: 0 };

test("cán bộ quản lý theo đơn vị không gán được phạm vi hệ thống hoặc vai trò hệ thống", () => {
  assert.match(getAssignmentDraftDenial(deptManager, { scopeType: "system" }, role, []), /hệ thống/);
  assert.match(getAssignmentDraftDenial(deptManager, { scopeType: "department", departmentId: "d1" }, { is_system: 1 }, []), /hệ thống/);
  assert.match(getAssignmentDraftDenial(deptManager, { scopeType: "department", departmentId: "d1" }, role, ["system.manage"]), /hệ thống/);
});

test("phạm vi cây chỉ được gán khi người thao tác có phạm vi cây bao trùm", () => {
  assert.match(getAssignmentDraftDenial(deptManager, { scopeType: "department_tree", departmentId: "d1" }, role, ["staff.view"]), /cây đơn vị/);
  assert.equal(getAssignmentDraftDenial(treeManager, { scopeType: "department_tree", departmentId: "d2" }, role, ["staff.view"]), null);
});

test("không gán được vai trò có quyền mà người thao tác chưa có hoặc đơn vị ngoài phạm vi", () => {
  assert.match(getAssignmentDraftDenial(deptManager, { scopeType: "department", departmentId: "d1" }, role, ["department.manage"]), /chưa được cấp/);
  assert.match(getAssignmentDraftDenial(deptManager, { scopeType: "specific_departments", departmentIds: ["d1", "d9"] }, role, ["staff.view"]), /đơn vị đã chọn/);
  assert.equal(getAssignmentDraftDenial(deptManager, { scopeType: "department", departmentId: "d1" }, role, ["staff.view"]), null);
});

test("system.manage được gán mọi vai trò/phạm vi", () => {
  const admin = context([{ scopeType: "system", departmentId: null, departmentIds: [] }], ["system.manage"]);
  assert.equal(getAssignmentDraftDenial(admin, { scopeType: "system" }, { is_system: 1 }, ["system.manage"]), null);
});
