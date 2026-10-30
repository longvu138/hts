const { existsSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const reportPath = path.resolve(process.cwd(), "playwright-report-vi/index.html");

if (!existsSync(reportPath)) {
  console.error("Chưa có báo cáo tiếng Việt. Hãy chạy pnpm test:e2e trước.");
  process.exit(1);
}

const opener =
  process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "cmd"
      : "xdg-open";
const args = process.platform === "win32" ? ["/c", "start", "", reportPath] : [reportPath];
const result = spawnSync(opener, args, { stdio: "inherit" });

process.exit(result.status ?? 0);
