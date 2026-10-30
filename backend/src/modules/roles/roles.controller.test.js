const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../../config/database");
const controller = require("./roles.controller");

test("ma trận và danh mục trả mọi quyền, kể cả quyền của phân hệ làm lại", async () => {
  // Exercise the controller mapper with a deterministic query result, without connecting to MySQL.
  const prototype = Object.getPrototypeOf(db("permission_actions"));
  const originalThen = prototype.then;
  const rows = ["staff.view", "task.view", "duty.view", "professional_work.manage", "custom.view"].map((name) => ({ name, role_id: "E2E_ROLE_1", action: name }));
  prototype.then = function (resolve, reject) { return Promise.resolve(rows).then(resolve, reject); };
  try {
    let result;
    const res = { json(body) { result = body; return this; } };
    await controller.listActions({}, res, (error) => { throw error; });
    assert.deepEqual(result.map((row) => row.name), ["staff.view", "task.view", "duty.view", "professional_work.manage", "custom.view"]);
    await controller.getRolePermissionsMatrix({}, res, (error) => { throw error; });
    assert.deepEqual(result, { E2E_ROLE_1: ["staff.view", "task.view", "duty.view", "professional_work.manage", "custom.view"] });
  } finally { prototype.then = originalThen; }
});
