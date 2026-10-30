import assert from "node:assert/strict";
import test from "node:test";
import { getApiErrorMessage, getApiRequestId, SERVER_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from "./apiError.js";

test("lỗi 5xx không lộ thông điệp kỹ thuật của máy chủ", () => {
  const error = { isAxiosError: true, response: { status: 500, data: { message: "Internal error" }, headers: { "x-request-id": "req-1" } } };
  assert.equal(getApiErrorMessage(error), SERVER_ERROR_MESSAGE);
  assert.equal(getApiRequestId(error), "req-1");
});

test("lỗi 4xx dùng thông điệp tiếng Việt từ backend", () => {
  const error = { isAxiosError: true, response: { status: 422, data: { message: "Mã cán bộ là bắt buộc" } } };
  assert.equal(getApiErrorMessage(error), "Mã cán bộ là bắt buộc");
});

test("mất mạng có thông điệp riêng, mã tra cứu lấy từ header request", () => {
  const error = { isAxiosError: true, config: { headers: { "X-Request-Id": "client-1" } } };
  assert.equal(getApiErrorMessage(error), NETWORK_ERROR_MESSAGE);
  assert.equal(getApiRequestId(error), "client-1");
});

test("không có lỗi hoặc dữ liệu null vẫn an toàn", () => {
  assert.equal(getApiErrorMessage(null, "Mặc định"), "Mặc định");
  assert.equal(getApiRequestId(null), "");
  assert.equal(getApiRequestId({ response: { data: null } }), "");
});
