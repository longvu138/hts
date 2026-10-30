const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRolePermissions } = require("./role-permissions.validator");
test("payload thiếu hoặc sai kiểu không được hiểu là xóa quyền", () => {
  for (const body of [undefined, {}, { actions: null }, { actions: "staff.view" }, { actions: [null] }, { actions: [" "] }, { actions: [1] }]) {
    assert.throws(() => validateRolePermissions(body), (error) => error.statusCode === 422);
  }
});
test("chỉ mảng rỗng tường minh mới yêu cầu xóa hết và quyền trùng được chuẩn hóa", () => {
  assert.deepEqual(validateRolePermissions({ actions: [] }), []);
  assert.deepEqual(validateRolePermissions({ actions: ["staff.view", "staff.view"] }), ["staff.view"]);
});
