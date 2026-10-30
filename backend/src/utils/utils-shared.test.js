const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePagination, buildPagination } = require("./pagination");
const { toIsoUtc, toDbDateTime } = require("./datetime");
const { escapeLike, containsPattern } = require("./sql-like");
const { AppError, conflict, fail } = require("./http-error");

test("phân trang dùng chung: page sai về 1, limit kẹp trong [1, 100]", () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(parsePagination({ page: "0", limit: "abc" }), { page: 1, limit: 20, offset: 0 });
  assert.deepEqual(parsePagination({ page: "3", limit: "999" }), { page: 3, limit: 100, offset: 200 });
  assert.deepEqual(parsePagination({ page: "-2", limit: "0" }), { page: 1, limit: 1, offset: 0 });
  assert.deepEqual(parsePagination({ page: "1.5" }, { defaultLimit: 25 }), { page: 1, limit: 25, offset: 0 });
  assert.deepEqual(buildPagination({ page: 1, limit: 20 }, 41), { page: 1, limit: 20, total: 41, totalPages: 3 });
});

test("thời gian luôn xuất ISO UTC, không phụ thuộc múi giờ máy chủ", () => {
  assert.equal(toIsoUtc("2026-10-24 01:00:00"), "2026-10-24T01:00:00Z");
  assert.equal(toIsoUtc(new Date(Date.UTC(2026, 9, 24, 1))), "2026-10-24T01:00:00Z");
  assert.equal(toIsoUtc(null), null);
  assert.equal(toDbDateTime("2026-10-24T08:00:00+07:00"), "2026-10-24 01:00:00");
});

test("tìm kiếm LIKE thoát ký tự đại diện", () => {
  assert.equal(escapeLike("50%_a\\b"), "50\\%\\_a\\\\b");
  assert.equal(containsPattern("x%"), "%x\\%%");
});

test("AppError giữ status, message và code", () => {
  const error = conflict("Xung đột", "X_CONFLICT");
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 409);
  assert.equal(error.code, "X_CONFLICT");
  assert.throws(() => fail(422, "Sai"), (e) => e.statusCode === 422 && e.message === "Sai");
});
