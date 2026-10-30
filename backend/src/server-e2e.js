// Entrypoint chỉ dùng khi chạy Playwright cục bộ.
// Đặt trước khi nạp application vì rate limiter đọc cấu hình lúc import module.
process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || "100000";
process.env.LOGIN_RATE_LIMIT_MAX = process.env.LOGIN_RATE_LIMIT_MAX || "1000";
process.env.AUTH_SENSITIVE_RATE_LIMIT_MAX = process.env.AUTH_SENSITIVE_RATE_LIMIT_MAX || "1000";

require("dotenv").config({ quiet: true });

const app = require("./app/application");
const db = require("./config/database");
const logger = require("./utils/logger");

const port = Number(process.env.PORT || 3108);
const server = app.listen(port, () => logger.info(`E2E server listening on port ${port}`));
const keepAlive = setInterval(() => {}, 60_000);

const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down E2E server.`);
  clearInterval(keepAlive);
  server.close(async () => {
    await db.destroy().catch(() => {});
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
