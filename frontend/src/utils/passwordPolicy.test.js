import assert from "node:assert/strict";
import test from "node:test";
import { PASSWORD_RULES_SUMMARY_ERROR, generateStrongPassword, getPasswordProblems, passwordPolicyRuleWithVisibleChecklist } from "./passwordPolicy.js";

test("mật khẩu tối thiểu 10 ký tự", () => {
  assert.deepEqual(getPasswordProblems("Abc@12345"), ["Mật khẩu phải có ít nhất 10 ký tự"]);
  assert.deepEqual(getPasswordProblems("Abc@123456"), []);
});

test("mật khẩu không chứa tên đăng nhập, không phân biệt hoa thường", () => {
  assert.deepEqual(getPasswordProblems("xxNguyenVanAxx1", { username: "nguyenvana" }), ["Mật khẩu không được chứa tên đăng nhập"]);
  assert.deepEqual(getPasswordProblems("Khac@2026xx", { username: "nguyenvana" }), []);
});

test("mật khẩu tối đa 72 byte, ký tự có dấu tính nhiều byte", () => {
  assert.deepEqual(getPasswordProblems("a".repeat(72)), []);
  assert.deepEqual(getPasswordProblems("a".repeat(73)), ["Mật khẩu quá dài. Vui lòng nhập ngắn hơn."]);
  assert.deepEqual(getPasswordProblems("ệ".repeat(25)), ["Mật khẩu quá dài. Vui lòng nhập ngắn hơn."]);
});

test("giá trị rỗng hoặc không phải chuỗi không ném lỗi", () => {
  assert.deepEqual(getPasswordProblems(""), []);
  assert.deepEqual(getPasswordProblems(null, { username: null }), []);
});

test("khớp backend: chỉ kiểm tra tên tài khoản khi có từ 3 ký tự (sau trim)", () => {
  assert.deepEqual(getPasswordProblems("abQwerty@2026", { username: "ab" }), []);
  assert.deepEqual(getPasswordProblems("xxABCxx@2026", { username: "  abc " }), ["Mật khẩu không được chứa tên đăng nhập"]);
});

test("khớp backend: độ dài tính theo đơn vị UTF-16 (value.length)", () => {
  // 5 emoji = 10 đơn vị UTF-16, 20 byte: backend coi là đủ 10 ký tự.
  assert.deepEqual(getPasswordProblems("😀".repeat(5)), []);
  assert.deepEqual(getPasswordProblems("😀".repeat(4) + "a"), ["Mật khẩu phải có ít nhất 10 ký tự"]);
});

test("rule có checklist hiển thị không lặp lại nội dung quy tắc", async () => {
  const rule = passwordPolicyRuleWithVisibleChecklist(() => "nguyenvana");
  await assert.rejects(rule.validator(null, "short"), { message: PASSWORD_RULES_SUMMARY_ERROR });
  await assert.rejects(rule.validator(null, "xxnguyenvanaxx"), { message: PASSWORD_RULES_SUMMARY_ERROR });
  await assert.rejects(rule.validator(null, "a".repeat(73)), { message: "Mật khẩu quá dài. Vui lòng nhập ngắn hơn." });
  await rule.validator(null, "Khac@2026xx");
  await rule.validator(null, "");
});

test("tạo mật khẩu ngẫu nhiên đạt chính sách và không chứa tên tài khoản", () => {
  for (let i = 0; i < 200; i += 1) {
    const password = generateStrongPassword({ username: "abc" });
    assert.equal(password.length, 16);
    assert.deepEqual(getPasswordProblems(password, { username: "abc" }), []);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.match(password, /[^A-Za-z0-9]/);
  }
  assert.equal(generateStrongPassword({ length: 4 }).length, 10);
  assert.equal(generateStrongPassword({ length: 500 }).length, 72);
});

test("tạo mật khẩu dùng nguồn ngẫu nhiên được truyền vào", () => {
  let calls = 0;
  const getRandomValues = (array) => { calls += 1; array[0] = calls * 2654435761; return array; };
  const password = generateStrongPassword({ getRandomValues });
  assert.ok(calls > 0);
  assert.deepEqual(getPasswordProblems(password), []);
});
