import { test } from "@playwright/test";
import assert from "node:assert/strict";
import { E2E_USERS } from "./helpers/users.js";
import { loginViaApi } from "./helpers/auth.js";

for (const status of [401, 500]) {
  test(`helper đăng nhập báo fail thay vì skip khi API trả ${status}`, async () => {
    const key = "helper_failure";
    E2E_USERS[key] = { username: "E2E_USER_helper", password: "E2E_fake_password" };
    try {
      const request = { post: async () => ({ ok: () => false, status: () => status, json: async () => ({ message: "E2E Lỗi đăng nhập" }) }) };
      await assert.rejects(loginViaApi(request, key), new RegExp(`Đăng nhập API thất bại.*${status}`));
    } finally { delete E2E_USERS[key]; }
  });
}

test("helper đăng nhập không nuốt lỗi mạng khi đã có credential", async () => {
  E2E_USERS.helper_failure = { username: "E2E_USER_helper", password: "E2E_fake_password" };
  try {
    await assert.rejects(loginViaApi({ post: async () => { throw new Error("E2E Mạng lỗi"); } }, "helper_failure"), /E2E Mạng lỗi/);
  } finally { delete E2E_USERS.helper_failure; }
});
