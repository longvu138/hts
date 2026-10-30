import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3109";
// E2E_QUICK=1: short timeouts, no video/trace/HTML report and a one-line-per-failure reporter.
// Use it while iterating on a change; run the default mode before a release.
const quick = process.env.E2E_QUICK === "1";
const artifacts = process.env.E2E_ARTIFACTS === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: quick ? 20_000 : 60_000,
  // Suite dùng chung database và có các case tạo user, reset mật khẩu, role.
  // Chạy tuần tự mặc định để tránh race/ECONNRESET; có thể tăng qua E2E_WORKERS.
  workers: Number(process.env.E2E_WORKERS || (quick ? 4 : 1)),
  expect: {
    timeout: quick ? 5_000 : 10_000,
  },
  fullyParallel: false,
  reporter: quick
    ? [["./e2e/reporters/compact-reporter.cjs"]]
    : [
      ["list"],
      ["html", { outputFolder: "playwright-report", open: "never" }],
      ["./e2e/reporters/vietnamese-html-reporter.cjs", { outputFolder: "playwright-report-vi" }],
    ],
  outputDir: "test-results",
  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    screenshot: "only-on-failure",
    // Recording every test made a full run take hours; keep them only for failures unless asked.
    trace: artifacts ? "on" : quick ? "off" : "retain-on-failure",
    video: artifacts ? "on" : quick ? "off" : "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
