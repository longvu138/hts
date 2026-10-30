import { expect, test } from "@playwright/test";
import { apiBaseURL, clearSession, loginAs, loginViaApi, logoutViaUi, setAuthStorage } from "./helpers/auth.js";
import { apiPostAs } from "./helpers/api.js";
import { e2eName, e2eSuffix } from "./helpers/data.js";
import { USER_KEYS, hasUserCredential } from "./helpers/users.js";
import { withNetworkRetry } from "./helpers/retry.js";

const loginDynamicUser = async (request, username, password) => {
  const response = await withNetworkRetry(() => request.post(`${apiBaseURL}/auth/login`, {
    data: { username, password },
  }));
  expect(response.ok(), `dynamic login failed ${response.status()}`).toBeTruthy();
  const body = await response.json();
  return { ...body, cookie: (response.headers()["set-cookie"] || "").split(";")[0] };
};

const authHeaders = (auth) => ({
  Cookie: auth.cookie,
  "X-CSRF-Token": auth.csrfToken,
});

test.describe("Đăng nhập và phiên làm việc", () => {
  test("giao diện không trắng trang khi storage bị trình duyệt chặn", async ({ page }) => {
    await page.addInitScript(() => {
      for (const method of ["getItem", "setItem", "removeItem"]) {
        Object.defineProperty(Storage.prototype, method, {
          configurable: true,
          value() {
            throw new DOMException("Storage bị chặn", "SecurityError");
          },
        });
      }
    });

    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
    await expect(page.getByRole("heading", { name: "ĐĂNG NHẬP" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
  });

  test("điều hướng mobile có landmark, trạng thái hiện tại và action bàn phím", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Chỉ kiểm tra semantic mobile.");
    await page.route(`${apiBaseURL}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pathname.endsWith("/auth/me")
        ? {
            user: {
              id: "e2e-accessibility-user",
              username: "e2e_accessibility",
              name: "E2E Accessibility",
              permissions: [],
            },
          }
        : pathname.endsWith("/notifications/unread-count")
          ? { unreadCount: 0 }
          : { items: [], pagination: { total: 0 } };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });

    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(navigation.getByRole("button", { name: "Công việc" })).toHaveAttribute("aria-current", "page");
    const accountButton = navigation.getByRole("button", { name: "Tài khoản" });
    await accountButton.focus();
    await page.keyboard.press("Enter");
    await expect(accountButton).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog", { name: "Tài khoản của tôi" }).getByRole("button", { name: "Đổi mật khẩu" })).toBeVisible();
  });

  for (const userKey of USER_KEYS) {
    test(`đăng nhập thành công với người dùng ${userKey}`, async ({ page }) => {
      test.skip(!hasUserCredential(userKey), `Thiếu credential cho người dùng ${userKey}`);
      await loginAs(page, userKey);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Công việc" })).toBeVisible();
    });
  }

  test("đăng nhập sai mật khẩu hiển thị lỗi", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("Nhập tài khoản").fill("not_a_real_user");
    await page.getByPlaceholder("Nhập mật khẩu").fill("definitely_wrong");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.getByText(/không chính xác|Lỗi đăng nhập/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("chưa đăng nhập vào đường dẫn riêng tư thì bị chuyển về trang đăng nhập", async ({ page }) => {
    await clearSession(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("đăng xuất xóa session và quay về trang đăng nhập", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/");
    await logoutViaUi(page);
    await expect(page).toHaveURL(/\/login/);
  });

  test("form đổi mật khẩu kiểm tra validation nhưng không đổi mật khẩu thật", async ({ page, request }) => {
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/change-password");
    await expect(page.getByRole("heading", { name: "Đổi mật khẩu" })).toBeVisible();
    await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(page.getByText("Nhập mật khẩu hiện tại")).toBeVisible();

    await page.locator("#newPassword").fill("short");
    await page.locator("#confirmPassword").fill("different");
    await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
    await expect(page.getByText(/ít nhất 10 ký tự|không khớp/).first()).toBeVisible();
  });

  test("/auth/me trả về user hiện tại và permission là array", async ({ request }) => {
    const auth = await loginViaApi(request, "superadmin");
    const response = await withNetworkRetry(() => request.get(`${apiBaseURL}/auth/me`, {
      headers: authHeaders(auth),
    }));
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.user.username).toBe(auth.user.username);
    expect(Array.isArray(body.user.permissions)).toBeTruthy();
  });

  test("admin có thể xem và thu hồi một phiên đăng nhập", async ({ request }) => {
    const suffix = e2eSuffix();
    const username = `e2e_session_${suffix}`;
    const password = `Secure_${suffix}_Aa1!`;
    const created = await apiPostAs(request, "superadmin", "/staff-members", {
      username,
      password,
      fullName: e2eName("USER_SESSION"),
      code: `E2E_USER_SESSION_${suffix}`,
    });
    const userId = created.data.id;
    const sessionA = await loginDynamicUser(request, username, password);
    const sessionB = await loginDynamicUser(request, username, password);
    const admin = await loginViaApi(request, "superadmin");

    const sessionsResponse = await request.get(`${apiBaseURL}/auth/admin/users/${userId}/sessions`, {
      headers: authHeaders(admin),
    });
    expect(sessionsResponse.ok()).toBeTruthy();
    const sessions = await sessionsResponse.json();
    expect(sessions.some((session) => session.id === sessionA.sessionId && session.active)).toBeTruthy();

    const revokeResponse = await request.delete(
      `${apiBaseURL}/auth/admin/users/${userId}/sessions/${sessionA.sessionId}`,
      { headers: authHeaders(admin) },
    );
    expect(revokeResponse.ok()).toBeTruthy();

    const revokedMe = await request.get(`${apiBaseURL}/auth/me`, {
      headers: authHeaders(sessionA),
    });
    expect(revokedMe.status()).toBe(401);
    const activeMe = await request.get(`${apiBaseURL}/auth/me`, {
      headers: authHeaders(sessionB),
    });
    expect(activeMe.ok()).toBeTruthy();
  });

  test("trang tài khoản mở được từ mobile bottom nav nếu UI có", async ({ page, request }) => {
    test.skip(test.info().project.name !== "mobile", "Chỉ chạy trên mobile.");
    await setAuthStorage(page, request, "superadmin");
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "Điều hướng chính" });
    const accountButton = navigation.getByRole("button", { name: "Tài khoản" });
    await expect(accountButton).toHaveAttribute("aria-expanded", "false");
    await accountButton.click();
    await expect(accountButton).toHaveAttribute("aria-expanded", "true");
    const accountDrawer = page.getByRole("dialog", { name: "Tài khoản của tôi" });
    await expect(accountDrawer.getByRole("button", { name: "Đổi mật khẩu" })).toBeVisible();
    await expect(accountDrawer.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });

  test("admin reset mật khẩu, user E2E bị bắt đổi mật khẩu rồi đổi thành công", async ({ page, request }) => {
    const suffix = e2eSuffix();
    const username = `e2e_auth_${suffix}`;
    const tempPassword = `E2E_Temp_${suffix}_Aa1!`;
    const resetPassword = `E2E_Reset_${suffix}_Aa1!`;
    const finalPassword = `E2E_Final_${suffix}_Aa1!`;
    const created = await apiPostAs(request, "superadmin", "/staff-members", {
      username,
      password: tempPassword,
      fullName: e2eName("USER_AUTH"),
      code: `E2E_USER_AUTH_${suffix}`,
      position: "E2E Auth",
    });
    expect(created.data.username).toBe(username);

    await apiPostAs(request, "superadmin", `/auth/admin/reset-password/${created.data.id}`, {
      password: resetPassword,
      confirmPassword: resetPassword,
    });

    await page.goto("/login");
    await page.getByPlaceholder("Nhập tài khoản").fill(username);
    await page.getByPlaceholder("Nhập mật khẩu").fill(resetPassword);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page).toHaveURL(/\/change-password/);

    const auth = await loginDynamicUser(request, username, resetPassword);
    const changeResponse = await withNetworkRetry(() => request.post(`${apiBaseURL}/auth/change-password`, {
      headers: authHeaders(auth),
      data: {
        currentPassword: resetPassword,
        newPassword: finalPassword,
        confirmPassword: finalPassword,
      },
    }));
    expect(changeResponse.ok()).toBeTruthy();
    const relogin = await loginDynamicUser(request, username, finalPassword);
    expect(relogin.user.mustChangePassword).toBeFalsy();

    await clearSession(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
