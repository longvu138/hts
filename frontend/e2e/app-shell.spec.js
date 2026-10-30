import { test, expect } from "@playwright/test";
import { mockRetainedApp } from "./helpers/retained-app.js";

const isMobile = (page) => (page.viewportSize()?.width || 0) < 768;

const USERS = {
  e2e_user_a: { id: "E2E_USER_a", username: "e2e_user_a", name: "E2E Người A", permissions: ["staff.view"] },
  e2e_user_b: { id: "E2E_USER_b", username: "e2e_user_b", name: "E2E Người B", permissions: [] },
};

/** Backend giả có đăng nhập/đăng xuất thật sự theo state; dữ liệu trả về phụ thuộc người đang đăng nhập. */
const mockSessionBackend = async (page) => {
  const state = { user: null, releaseB: null };
  const bGate = new Promise((resolve) => { state.releaseB = resolve; });
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const method = request.method();
    const user = state.user;
    if (path === "/auth/login" && method === "POST") {
      const { username } = request.postDataJSON() || {};
      state.user = USERS[username] || null;
      return state.user
        ? route.fulfill({ json: { user: state.user, csrfToken: "E2E_csrf" } })
        : route.fulfill({ status: 401, json: { message: "Tài khoản hoặc mật khẩu không chính xác" } });
    }
    if (path === "/auth/logout") {
      state.user = null;
      return route.fulfill({ json: { success: true } });
    }
    if (!user) return route.fulfill({ status: 401, json: { message: "Không có quyền truy cập, vui lòng đăng nhập" } });
    if (path === "/auth/me") return route.fulfill({ json: { user } });
    if (path === "/notifications/unread-count") return route.fulfill({ json: { unreadCount: user.id === "E2E_USER_a" ? 9 : 0 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], pagination: { total: 0 } } });
    if (path.startsWith("/push")) return route.fulfill({ json: { enabled: false } });
    if (path === "/staff-members") return route.fulfill({ json: { staffMembers: [], pagination: { page: 1, limit: 1, total: 42, totalPages: 42 } } });
    if (path === "/work-assignments") {
      if (user.id === "E2E_USER_b") {
        await bGate;
        return route.fulfill({ json: { items: [{ id: "E2E_WORK_b", title: "E2E Việc của B", startsAt: "2026-10-24T01:00:00Z", endsAt: "2026-10-24T02:00:00Z", status: "assigned" }], pagination: { total: 1 } } });
      }
      return route.fulfill({ json: { items: [{ id: "E2E_WORK_a", title: "E2E Việc bí mật của A", startsAt: "2026-10-24T01:00:00Z", endsAt: "2026-10-24T02:00:00Z", status: "assigned" }], pagination: { total: 1 } } });
    }
    return route.fulfill({ status: 404, json: { message: `E2E chưa mock ${method} ${path}` } });
  });
  return state;
};

const loginThroughUi = async (page, username) => {
  await page.getByPlaceholder("Nhập tài khoản").fill(username);
  await page.getByPlaceholder("Nhập mật khẩu").fill("E2E_password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Công việc" })).toBeVisible();
};

const logoutThroughUi = async (page) => {
  if (isMobile(page)) {
    await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Tài khoản", exact: true }).click();
    await page.getByRole("dialog", { name: "Tài khoản của tôi" }).getByRole("button", { name: "Đăng xuất" }).click();
  } else {
    await page.getByRole("button", { name: /^Tài khoản của tôi/ }).click();
    await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  }
  await expect(page).toHaveURL(/\/login$/);
};

test("đổi người dùng: B không bao giờ thấy dữ liệu cache của A sau khi A đăng xuất", async ({ page }) => {
  const state = await mockSessionBackend(page);
  let meCalls = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/auth/me") meCalls += 1; });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "ĐĂNG NHẬP" })).toBeVisible();
  expect(meCalls, "/auth/me chỉ gọi một lần khi khởi động").toBe(1);

  await loginThroughUi(page, "e2e_user_a");
  await expect(page.getByText("E2E Việc bí mật của A")).toBeVisible();

  await logoutThroughUi(page);
  await loginThroughUi(page, "e2e_user_b");
  // Request việc của B đang bị giữ lại: nếu cache cũ còn, dữ liệu của A sẽ hiện ngay lúc này.
  await expect(page.getByText("E2E Việc bí mật của A")).toHaveCount(0);
  await expect(page.getByText("Cán bộ trong phạm vi được xem")).toHaveCount(0);
  await expect(page.locator(".notification-bell-badge .ant-badge-count")).toHaveCount(0);
  state.releaseB();
  await expect(page.getByText("E2E Việc của B")).toBeVisible();
  await expect(page.getByText("E2E Việc bí mật của A")).toHaveCount(0);
});

test("phiên hết hạn (401) xóa cache và đưa về trang đăng nhập", async ({ page }) => {
  const state = await mockSessionBackend(page);
  await page.goto("/login");
  await loginThroughUi(page, "e2e_user_a");
  await expect(page.getByText("E2E Việc bí mật của A")).toBeVisible();
  state.user = null;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  state.user = USERS.e2e_user_b;
  state.releaseB();
  await page.goto("/");
  await expect(page.getByText("E2E Việc của B")).toBeVisible();
  await expect(page.getByText("E2E Việc bí mật của A")).toHaveCount(0);
});

for (const width of [390, 768, 1440]) {
  test(`vùng chạm của header, chuông và menu đủ lớn ở ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockRetainedApp(page);
    await page.goto("/");
    const minSize = width > 1024 ? 24 : 40;
    const sizeOf = async (locator) => {
      const box = await locator.boundingBox();
      expect(box, "phần tử phải hiển thị").not.toBeNull();
      return Math.round(Math.min(box.width, box.height));
    };
    const bell = page.getByRole("button", { name: "Thông báo", exact: true });
    expect(await sizeOf(bell)).toBeGreaterThanOrEqual(minSize);
    if (width < 768) {
      expect(await sizeOf(page.getByRole("button", { name: "Làm mới dữ liệu" }))).toBeGreaterThanOrEqual(40);
    } else {
      expect(await sizeOf(page.getByRole("button", { name: /Mở rộng menu|Thu gọn menu/ }))).toBeGreaterThanOrEqual(minSize);
      const navItem = page.getByRole("navigation", { name: "Menu chính" }).getByRole("button", { name: "Công việc" });
      await expect.poll(async () => Math.round((await navItem.boundingBox())?.height || 0)).toBeGreaterThanOrEqual(width > 1024 ? 32 : 44);
    }

    await bell.click();
    const toggle = page.getByRole("button", { name: "Bật thông báo trình duyệt" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveClass(/ant-btn-primary/);
    // Popover có hiệu ứng phóng to khi mở: đo lại cho tới khi animation kết thúc.
    await expect.poll(() => sizeOf(toggle)).toBeGreaterThanOrEqual(width > 1024 ? 24 : 40);
    await expect.poll(() => sizeOf(page.getByRole("button", { name: "Đánh dấu tất cả đã đọc" }))).toBeGreaterThanOrEqual(width > 1024 ? 24 : 40);
    const title = page.locator(".notification-title").first();
    await expect(title).toHaveAttribute("title", "E2E Thông báo lịch sử");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: test.info().outputPath(`bell-${width}.png`), animations: "disabled" });
  });
}

test("sheet Tài khoản của tôi: tay kéo nằm trên tiêu đề, đổi mật khẩu dùng biểu tượng khóa", async ({ page }) => {
  test.skip(test.info().project.name !== "mobile" && (page.viewportSize()?.width || 0) >= 768, "Chỉ có trên mobile.");
  await mockRetainedApp(page);
  await page.goto("/");
  await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Tài khoản", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Tài khoản của tôi" });
  await expect(sheet).toBeVisible();
  // Read both rectangles in the same browser task: the drawer moves while opening.
  await expect.poll(() => sheet.evaluate(element => {
    const handle = element.querySelector('.mobile-sheet-handle')?.getBoundingClientRect();
    const heading = element.querySelector('.mobile-sheet-title > span:last-child')?.getBoundingClientRect();
    return Boolean(handle && heading && handle.bottom <= heading.top + 0.5);
  })).toBeTruthy();
  await expect(sheet.getByRole("button", { name: "Đổi mật khẩu" }).locator(".anticon-lock")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("account-sheet.png"), animations: "disabled" });
});

test("đổi mật khẩu hiển thị quy tắc trước khi gửi và chặn mật khẩu chứa tên đăng nhập", async ({ page }) => {
  const writes = [];
  await mockRetainedApp(page, { user: { username: "e2e_user_mock" } });
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("change-password")) writes.push(request.url()); });
  await page.goto("/change-password");
  const rules = page.getByRole("list", { name: "Quy tắc mật khẩu mới" });
  await expect(rules).toContainText("Tối thiểu 10 ký tự");
  await expect(rules).toContainText("Không chứa tên đăng nhập");
  await expect(rules).not.toContainText(/byte/i);
  await expect(rules.getByRole("listitem")).toHaveCount(2);
  await page.locator("#currentPassword").fill("E2E_current");
  await page.locator("#newPassword").fill("Xx_e2e_user_mock_2026");
  await page.locator("#confirmPassword").fill("Xx_e2e_user_mock_2026");
  const submit = page.getByRole("button", { name: "Đổi mật khẩu" });
  expect((await submit.boundingBox()).height).toBeGreaterThanOrEqual(40);
  await submit.click();
  // Danh sách quy tắc báo trực tiếp đạt/chưa đạt; lỗi trường không lặp lại cùng nội dung.
  await expect(rules.getByRole("listitem", { name: "Không chứa tên đăng nhập: chưa đạt" })).toBeVisible();
  await expect(rules.getByRole("listitem", { name: "Tối thiểu 10 ký tự: đạt" })).toBeVisible();
  await expect(page.getByText("Mật khẩu mới chưa đạt yêu cầu bên dưới")).toBeVisible();
  await expect(page.getByText("Mật khẩu không được chứa tên đăng nhập")).toHaveCount(0);
  await page.locator("#newPassword").fill("short");
  await expect(rules.getByRole("listitem", { name: "Tối thiểu 10 ký tự: chưa đạt" })).toBeVisible();
  await expect(page.getByText("Mật khẩu phải có ít nhất 10 ký tự")).toHaveCount(0);
  await page.locator("#newPassword").fill("ệ".repeat(25));
  await expect(page.getByText("Mật khẩu quá dài. Vui lòng nhập ngắn hơn.")).toBeVisible();
  expect(writes).toEqual([]);
  await expect(page.getByRole("button", { name: "Quay lại" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("change-password.png"), fullPage: true, animations: "disabled" });
});

test("không có cảnh báo API cũ của Ant Design trên các màn khung ứng dụng", async ({ page }) => {
  const warnings = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/\[antd: [^\]]+\]/.test(text) && /deprecated|instead/i.test(text)) warnings.push(text);
  });
  await mockRetainedApp(page);
  for (const path of ["/", "/staff", "/departments", "/system/roles", "/change-password"]) {
    await page.goto(path);
    await expect(page.locator(".ant-typography").first()).toBeVisible();
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await expect(page.getByText("Thông báo trình duyệt", { exact: true })).toBeVisible();
  if (isMobile(page)) {
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("button", { name: "Tài khoản", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Tài khoản của tôi" })).toBeVisible();
  }
  expect(warnings).toEqual([]);
});

test("layout không đổi cây desktop/mobile ở lần render đầu", async ({ page }) => {
  await page.addInitScript(() => {
    window.__layoutMounts = [];
    new MutationObserver(() => {
      const kind = document.querySelector(".topbar-mobile") ? "mobile" : document.querySelector(".topbar") ? "desktop" : null;
      if (kind && window.__layoutMounts.at(-1) !== kind) window.__layoutMounts.push(kind);
    }).observe(document, { childList: true, subtree: true });
  });
  await mockRetainedApp(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Công việc" })).toBeVisible();
  const mounts = await page.evaluate(() => window.__layoutMounts);
  expect(mounts).toEqual([isMobile(page) ? "mobile" : "desktop"]);
});

test("sidebar desktop mở rộng có nhãn từ 1280px, ghi nhớ lựa chọn thu gọn và có tooltip khi thu gọn", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockRetainedApp(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Menu chính" });
  const workItem = nav.getByRole("button", { name: "Công việc" });
  await expect(workItem).toContainText("Công việc");
  await page.getByRole("button", { name: "Thu gọn menu" }).click();
  await expect(workItem).not.toContainText("Công việc");
  await workItem.hover();
  await expect(page.getByRole("tooltip", { name: "Công việc" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Mở rộng menu" })).toBeVisible();
  await page.getByRole("button", { name: "Mở rộng menu" }).click();
  await expect(workItem).toContainText("Công việc");
});
