const test = require("node:test");
const assert = require("node:assert/strict");
const { getDescendantDepartmentIds, wouldCreateDepartmentCycle } = require("./org.service");

const tree = [
  { id: "root", parent_id: null },
  { id: "a", parent_id: "root" },
  { id: "b", parent_id: "a" },
  { id: "c", parent_id: "root" },
];

test("lấy đơn vị con cháu theo cây", () => {
  assert.deepEqual(getDescendantDepartmentIds(tree, "root").sort(), ["a", "b", "c"]);
  assert.deepEqual(getDescendantDepartmentIds(tree, "b"), []);
});

test("dữ liệu vòng cha/con không làm treo khi lấy con cháu", () => {
  const cyclic = [{ id: "x", parent_id: "z" }, { id: "y", parent_id: "x" }, { id: "z", parent_id: "y" }];
  assert.deepEqual(getDescendantDepartmentIds(cyclic, "x").sort(), ["y", "z"]);
  assert.equal(wouldCreateDepartmentCycle(cyclic, "x", "y"), true);
});

test("chặn chọn chính nó hoặc đơn vị con làm đơn vị cha", () => {
  assert.equal(wouldCreateDepartmentCycle(tree, "a", "a"), true);
  assert.equal(wouldCreateDepartmentCycle(tree, "a", "b"), true);
  assert.equal(wouldCreateDepartmentCycle(tree, "a", "c"), false);
  assert.equal(wouldCreateDepartmentCycle(tree, "a", null), false);
});
