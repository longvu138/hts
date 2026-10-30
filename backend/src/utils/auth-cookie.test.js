const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_SECRET ||= "unit-test-jwt-secret";

const {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  createCsrfToken,
  getAuthToken,
  setAuthCookie,
  verifyCsrfToken,
} = require("./auth-cookie");

test("reads the authentication token from its cookie", () => {
  const req = { headers: { cookie: `theme=dark; ${AUTH_COOKIE_NAME}=jwt-value` } };
  assert.equal(getAuthToken(req), "jwt-value");
});

test("sets an HttpOnly authentication cookie and clears it with matching options", () => {
  const calls = [];
  const res = {
    cookie: (...args) => calls.push(["set", ...args]),
    clearCookie: (...args) => calls.push(["clear", ...args]),
  };
  setAuthCookie(res, "jwt-value", new Date(Date.now() + 60_000));
  clearAuthCookie(res);

  assert.equal(calls[0][1], AUTH_COOKIE_NAME);
  assert.equal(calls[0][3].httpOnly, true);
  assert.equal(calls[0][3].path, "/");
  assert.equal(calls[1][1], AUTH_COOKIE_NAME);
  assert.equal(calls[1][2].httpOnly, true);
});

test("CSRF tokens are signed and bound to one session", () => {
  const token = createCsrfToken("session-a");
  assert.equal(verifyCsrfToken("session-a", token), true);
  assert.equal(verifyCsrfToken("session-b", token), false);
  assert.equal(verifyCsrfToken("session-a", `${token}tampered`), false);
});

test("cookie HTS không đọc phiên NTDLS trên cùng localhost", () => {
  assert.equal(getAuthToken({ headers: { cookie: "ntdls_session=legacy-token" } }), null);
});
