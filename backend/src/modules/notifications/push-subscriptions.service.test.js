const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedPushEndpoint } = require("./push-subscriptions.service");

test("chỉ chấp nhận endpoint HTTPS của dịch vụ Web Push đã biết", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QABC",
  ]) assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example.com/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.example/abc",
    "https://user:pass@fcm.googleapis.com/abc",
    "https://fcm.googleapis.com:8443/abc",
    "https://127.0.0.1/abc",
    "không phải url",
  ]) assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
});
