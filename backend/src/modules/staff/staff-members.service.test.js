const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeListPagination, providedPassword } = require("./staff-members.service");

test("phân trang nhân sự dùng giá trị mặc định an toàn", () => {
  assert.deepEqual(normalizeListPagination(), {
    page: 1,
    limit: 25,
    offset: 0,
  });
});

test("phân trang nhân sự giới hạn tối đa 100 bản ghi", () => {
  assert.deepEqual(normalizeListPagination({ page: "3", limit: "999" }), {
    page: 3,
    limit: 100,
    offset: 200,
  });
});

test("phân trang nhân sự loại bỏ page và limit không hợp lệ", () => {
  assert.deepEqual(normalizeListPagination({ page: "0", limit: "invalid" }), {
    page: 1,
    limit: 25,
    offset: 0,
  });
});


const { validateCreateStaffBasics, validateUpdateStaffBasics } = require("./staff-members.service");
for (const username of [undefined, null, "", "   "]) {
  test(`tạo tài khoản từ chối tên đăng nhập trống: ${JSON.stringify(username)}`, async () => {
    await assert.rejects(validateCreateStaffBasics({ code: "E2E_USER_required", fullName: "E2E Tài khoản", username }), { statusCode: 422, message: "Tên đăng nhập là bắt buộc" });
  });
}
for (const username of [null, "", "   "]) {
  test(`sửa tài khoản không cho xóa tên đăng nhập: ${JSON.stringify(username)}`, async () => {
    await assert.rejects(validateUpdateStaffBasics({ username }), { statusCode: 422, message: "Tên đăng nhập không được để trống" });
  });
}
test("sửa thông tin khác không bắt buộc gửi lại tên đăng nhập", async () => {
  await validateUpdateStaffBasics({ fullName: "E2E Họ tên mới" });
});

test("mật khẩu trống/null là không đổi, giá trị không phải chuỗi trả 422 thay vì lỗi 500", () => {
  for (const password of [undefined, null, ""]) assert.equal(providedPassword({ password }), undefined);
  assert.equal(providedPassword({ password: "E2E_Valid_pass1" }), "E2E_Valid_pass1");
  for (const password of [0, 12345678901, ["x"], { a: 1 }, true]) {
    assert.throws(() => providedPassword({ password }), (error) => error.statusCode === 422);
  }
});
