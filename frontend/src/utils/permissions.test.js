import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission } from "./permissions.js";
test("quyền quản trị và quyền xem được phân biệt", () => {
  assert.equal(hasPermission({ permissions: ["staff.view"] }, "staff.manage"), false);
  assert.equal(hasPermission({ permissions: ["staff.view"] }, "staff.view"), true);
  assert.equal(hasPermission({ permissions: ["system.manage"] }, "staff.manage"), true);
  assert.equal(hasPermission(null, "staff.view"), false);
});
