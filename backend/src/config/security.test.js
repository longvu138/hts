const test = require("node:test");
const assert = require("node:assert/strict");
const { assertSecuritySecrets, getCsrfSecret, validateSecuritySecrets } = require("./security");

const strong = (seed) => `${seed}`.repeat(40).slice(0, 48);

test("production từ chối secret thiếu, ngắn, giá trị mẫu hoặc trùng nhau", () => {
  for (const env of [
    { NODE_ENV: "production" },
    { NODE_ENV: "production", JWT_SECRET: "short", CSRF_SECRET: strong("b") },
    { NODE_ENV: "production", JWT_SECRET: strong("a"), CSRF_SECRET: strong("a") },
    { NODE_ENV: "production", JWT_SECRET: "replace-with-a-long-random-secret", CSRF_SECRET: strong("b") },
    { NODE_ENV: "production", JWT_SECRET: strong("a"), CSRF_SECRET: strong("b"), BOOTSTRAP_TOKEN: "abc" },
  ]) assert.throws(() => assertSecuritySecrets(env), /không hợp lệ/);
  assert.deepEqual(assertSecuritySecrets({ NODE_ENV: "production", JWT_SECRET: strong("a"), CSRF_SECRET: strong("b") }), []);
});

test("môi trường phát triển chỉ cảnh báo và tự dẫn xuất khóa CSRF riêng", () => {
  const env = { NODE_ENV: "development", JWT_SECRET: "dev" };
  assert.ok(validateSecuritySecrets(env).length > 0);
  assert.doesNotThrow(() => assertSecuritySecrets(env));
  const derived = getCsrfSecret(env);
  assert.ok(derived && derived !== env.JWT_SECRET);
  assert.equal(getCsrfSecret({ NODE_ENV: "production", JWT_SECRET: strong("a") }), "", "production không bao giờ dùng JWT_SECRET cho CSRF");
});
