import { expect, test } from "@playwright/test";
import { getUserCredential, missingCredentialReason } from "./users.js";
import { withNetworkRetry } from "./retry.js";

export const apiBaseURL = process.env.E2E_API_BASE_URL || "http://localhost:3108/api";

export const loginViaApi = async (request, userKey) => {
  const credential = getUserCredential(userKey);
  test.skip(!credential?.username || !credential?.password, missingCredentialReason(userKey));

  const response = await withNetworkRetry(() => request.post(`${apiBaseURL}/auth/login`, {
    data: {
      username: credential.username,
      password: credential.password,
    },
    timeout: 10_000,
  }));
  if (!response.ok()) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`Đăng nhập API thất bại cho "${userKey}" (${response.status()}): ${failure.message || "không rõ lỗi"}`);
  }
  const body = await response.json();
  const setCookie = response.headers()["set-cookie"] || "";
  return { ...body, cookie: setCookie.split(";")[0] };
};

export const loginAs = async (page, userKey) => {
  const credential = getUserCredential(userKey);
  test.skip(!credential?.username || !credential?.password, missingCredentialReason(userKey));

  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "ĐĂNG NHẬP" })).toBeVisible();
  await page.getByPlaceholder("Nhập tài khoản").fill(credential.username);
  await page.getByPlaceholder("Nhập mật khẩu").fill(credential.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });
  } catch (error) {
    const failure = await page.getByText(/không chính xác|Lỗi đăng nhập|bị tắt/i).first().textContent().catch(() => "");
    throw new Error(`Đăng nhập UI thất bại cho "${userKey}"${failure ? `: ${failure}` : ""}`, { cause: error });
  }
  const me = await page.request.get(`${apiBaseURL}/auth/me`);
  expect(me.ok(), "Không lấy được phiên sau khi đăng nhập UI").toBeTruthy();
  return (await me.json()).user;
};

export const setAuthStorage = async (page, request, userKey) => {
  const auth = await loginViaApi(request, userKey);
  const [name, value] = auth.cookie.split("=");
  await page.context().addCookies([{ name, value, url: new URL(apiBaseURL).origin }]);
  await page.goto("/");
  const me = await page.request.get(`${apiBaseURL}/auth/me`, {
    headers: { Cookie: auth.cookie },
  });
  expect(me.ok(), "Không khôi phục được phiên đăng nhập cho test").toBeTruthy();
  return (await me.json()).user;
};

export const clearSession = async (page) => {
  await page.context().clearCookies();
};

export const logoutViaUi = async (page) => {
  // Mobile: tab "Tài khoản" ở thanh dưới; desktop: nút hồ sơ "Tài khoản của tôi: <tên>" trên header.
  const mobileAccount = page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Tài khoản", exact: true });
  const desktopAccount = page.getByRole("button", { name: /^Tài khoản của tôi/ });
  const accountNav = (await mobileAccount.isVisible().catch(() => false)) ? mobileAccount : desktopAccount;
  if (await accountNav.isVisible().catch(() => false)) {
    await accountNav.click();
    const logout = page.getByText("Đăng xuất", { exact: true }).last();
    if (await logout.isVisible().catch(() => false)) {
      await logout.click();
      await expect(page).toHaveURL(/\/login/);
      return;
    }
  }

  await clearSession(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
};
