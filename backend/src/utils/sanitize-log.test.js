const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeForLog } = require("./sanitize-log");

test("log che khóa Web Push, mật khẩu và ghi thời gian dạng ISO", () => {
  const result = sanitizeForLog({
    password: "x",
    keys: { p256dh: "k", auth: "a" },
    body: { endpoint: "https://fcm.googleapis.com/x", auth: "a" },
    startsAt: new Date(Date.UTC(2026, 9, 24, 1)),
    authorName: "Không bị che",
  });
  assert.equal(result.password, "[REDACTED]");
  assert.equal(result.keys, "[REDACTED]");
  assert.equal(result.body.endpoint, "[REDACTED]");
  assert.equal(result.body.auth, "[REDACTED]");
  assert.equal(result.startsAt, "2026-10-24T01:00:00.000Z");
  assert.equal(result.authorName, "Không bị che");
});
