const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveListenTarget } = require("./listen-target");

test("server dùng cổng số khi PORT là số", () => {
  assert.equal(resolveListenTarget("3108"), 3108);
});

test("server giữ nguyên Unix socket do Passenger cấp", () => {
  assert.equal(resolveListenTarget("/tmp/passenger.sock"), "/tmp/passenger.sock");
});

test("HTS dùng cổng riêng 3108 khi PORT trống", () => {
  assert.equal(resolveListenTarget(""), 3108);
});
