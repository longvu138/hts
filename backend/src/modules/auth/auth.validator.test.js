const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAccountInput, validatePasswordInput, validateLoginInput } = require("./auth.validator");

test("validator tài khoản từ chối payload thiếu hoặc sai kiểu bằng lỗi 422", () => {
  for (const body of [null, [], 1, {}, { username: 1, password: "E2E_password" }, { username: "e2e_user", password: 1 }]) {
    assert.throws(() => validateAccountInput(body), (error) => error.statusCode === 422);
  }
  assert.equal(validateAccountInput({ username: " e2e_user ", password: "E2E_password" }).username, "e2e_user");
});
test("validator mật khẩu từ chối thiếu xác nhận, sai kiểu và không trùng nhau", () => {
  for (const body of [null, {}, { password: 123, confirmPassword: "123" }, { password: "E2E_password", confirmPassword: "khác" }]) {
    assert.throws(() => validatePasswordInput(body), (error) => error.statusCode === 422);
  }
  assert.equal(validatePasswordInput({ password: "E2E_password", confirmPassword: "E2E_password" }), "E2E_password");
});

test("đăng nhập với payload thiếu hoặc sai kiểu trả 422 thay vì lỗi nội bộ", () => {
  for (const body of [null, {}, { username: 123, password: "E2E_password" }, { username: "e2e_user", password: [] }]) {
    assert.throws(() => validateLoginInput(body), (error) => error.statusCode === 422);
  }
  assert.equal(validateLoginInput({ username: " e2e_user ", password: "E2E_password" }).username, "e2e_user");
});

test("trường tùy chọn của tài khoản được kiểm tra kiểu, độ dài và email", () => {
  const account = { username: "e2e_user", password: "E2E_password" };
  for (const fields of [{ phone: [] }, { departmentId: {} }, { fullName: 123 }, { email: "sai-email" }, { code: "x".repeat(51) }]) {
    assert.throws(() => validateAccountInput({ ...account, ...fields }), (error) => error.statusCode === 422);
  }
});
