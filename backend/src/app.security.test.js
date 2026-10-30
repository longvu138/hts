const test = require("node:test");
const assert = require("node:assert/strict");

process.env.REQUEST_BODY_LIMIT = "1kb";
process.env.CORS_ALLOW_SAME_ORIGIN = "true";
process.env.CORS_ALLOWED_ORIGINS = "https://allowed.example";

const app = require("./app/application");

test("CORS rejects unknown browser origins", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(response.status, 403);
});

test("CORS preflight allows CSRF and idempotency headers", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/staff-members`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://allowed.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-csrf-token,idempotency-key",
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://allowed.example");
  const allowedHeaders = String(response.headers.get("access-control-allow-headers"))
    .toLowerCase()
    .split(",")
    .map((header) => header.trim());
  assert.ok(allowedHeaders.includes("x-csrf-token"));
  assert.ok(allowedHeaders.includes("idempotency-key"));
});

test("request body limit rejects oversized JSON", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "test", password: "x".repeat(2000) }),
  });
  assert.equal(response.status, 413);
});

test("API chưa đăng nhập trả 401", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  for (const path of ["/departments", "/staff-members", "/roles", "/notifications", "/auth/me"]) {
    assert.equal((await fetch(base + path)).status, 401, path);
  }
});

test("CORS cho phép frontend đọc X-Request-Id để hiển thị mã tra cứu", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { Origin: "https://allowed.example" },
  });
  assert.match(response.headers.get("access-control-expose-headers") || "", /X-Request-Id/i);
  assert.ok(response.headers.get("x-request-id"));
});

test("CORS cùng website HTTP hoạt động không cần khai báo IP trước", async t => {
  const server = app.listen(0);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/auth/me', { headers: { Origin: base } });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('access-control-allow-origin'), base);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  const denied = await fetch(base + '/', { headers: { Origin: 'http://127.0.0.1:1' } });
  assert.equal(denied.status, 403);
});
