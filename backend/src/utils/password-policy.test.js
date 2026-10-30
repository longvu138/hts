const test = require("node:test");
const assert = require("node:assert/strict");

const { assertPasswordPolicy, validatePassword } = require("./password-policy");

test("chính sách mật khẩu chấp nhận mật khẩu từ 10 ký tự", () => {
  assert.equal(validatePassword("1234567890").valid, true);
  assert.equal(validatePassword("E2E_password_2026", { username: "e2e_member" }).valid, true);
});

test("chính sách mật khẩu từ chối mật khẩu ngắn, quá 72 byte hoặc chứa tên tài khoản", () => {
  assert.equal(validatePassword("123456789").valid, false);
  assert.equal(validatePassword("a".repeat(73)).valid, false);
  assert.equal(validatePassword("ă".repeat(40)).valid, false, "72 byte UTF-8, không phải 72 ký tự");
  assert.equal(validatePassword("XinChao-NguyenVanA-2026", { username: "nguyenvana" }).valid, false);
  assert.throws(
    () => assertPasswordPolicy("short"),
    (error) => error.statusCode === 422 && error.code === "PASSWORD_POLICY_FAILED",
  );
});

test("thông báo mật khẩu quá dài không yêu cầu người dùng hiểu byte", () => {
  assert.throws(() => assertPasswordPolicy("ệ".repeat(25)), error => error.statusCode === 422 && !/byte/i.test(error.message) && /nhập ngắn hơn/.test(error.message));
});
