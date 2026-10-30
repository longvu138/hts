const test = require("node:test");
const assert = require("node:assert/strict");

const { getClientInfo } = require("./client-info");

test("client info extracts IP, browser, OS and device type", () => {
  const req = {
    ip: "203.0.113.10",
    get: (name) => name === "user-agent"
      ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36"
      : undefined,
  };
  assert.deepEqual(getClientInfo(req), {
    ipAddress: "203.0.113.10",
    userAgent: req.get("user-agent"),
    browser: "Chrome 126.0.0.0",
    os: "Windows",
    deviceType: "desktop",
  });
});
