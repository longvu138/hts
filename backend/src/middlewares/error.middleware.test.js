const test = require("node:test");
const assert = require("node:assert/strict");

const { errorHandler } = require("./error.middleware");

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const createRequest = () => ({
  requestId: "test-request-id",
  method: "POST",
  originalUrl: "/api/test",
  params: {},
  query: {},
  body: { password: "must-not-be-returned" },
  get: () => "node-test",
  ip: "127.0.0.1",
});

test("500 response does not expose internal error details", () => {
  const response = createResponse();
  errorHandler(new Error("private SQL detail"), createRequest(), response, () => {});
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.requestId, "test-request-id");
  assert.doesNotMatch(response.body.message, /private SQL detail/);
});

test("oversized body returns a safe 413 response", () => {
  const response = createResponse();
  const error = new Error("request entity too large");
  error.type = "entity.too.large";
  errorHandler(error, createRequest(), response, () => {});
  assert.equal(response.statusCode, 413);
  assert.match(response.body.message, /giới hạn/);
});

test("500 không trả mã lỗi nội bộ của MySQL", () => {
  const response = createResponse();
  const error = new Error("Duplicate entry");
  error.code = "ER_DUP_ENTRY";
  errorHandler(error, createRequest(), response, () => {});
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.code, undefined);
});

test("lỗi nghiệp vụ giữ mã code do ứng dụng đặt", () => {
  const { conflict } = require("../utils/http-error");
  const response = createResponse();
  errorHandler(conflict("Phiên bản cũ", "WORK_VERSION_CONFLICT"), createRequest(), response, () => {});
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.code, "WORK_VERSION_CONFLICT");
});
