const test = require("node:test");
const assert = require("node:assert/strict");
const { getRequestId } = require("./request-context.middleware");

const req = (value) => ({ get: () => value });

test("X-Request-Id chỉ nhận [A-Za-z0-9-] tối đa 64 ký tự", () => {
  assert.equal(getRequestId(req("abc-DEF-123")), "abc-DEF-123");
  for (const value of ["x".repeat(65), "a b", "a\nb", "<script>", "", undefined]) {
    const generated = getRequestId(req(value));
    assert.notEqual(generated, value);
    assert.match(generated, /^[0-9a-f-]{36}$/);
  }
});
