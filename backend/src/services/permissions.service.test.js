const assert = require("node:assert/strict");
const test = require("node:test");
const { can, getAccessibleDepartmentIds } = require("./permissions.service");
test("quyền nhân sự chỉ áp dụng đúng hành động và phạm vi", () => {
 const context = { permissions: ["staff.view"], permissionScopes: [{ action: "staff.view", scopeType: "department", departmentIds: ["a"] }] };
 assert.equal(can(context, "staff.manage"), false);
 assert.equal(can(context, "staff.view"), true);
 assert.deepEqual(getAccessibleDepartmentIds(context, "staff.view"), ["a"]);
 assert.deepEqual(getAccessibleDepartmentIds(context, "staff.manage"), []);
});
