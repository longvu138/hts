const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { auditLog } = require("../utils/audit-log");

const numberEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const rateLimitHandler = (event) => (req, res, _next, options) => {
  auditLog(req, "warn", { event, statusCode: options.statusCode });
  res.status(options.statusCode).json({
    requestId: req.requestId,
    code: "RATE_LIMITED",
    message: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
  });
};

const apiLimiter = rateLimit({
  windowMs: numberEnv("API_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: numberEnv("API_RATE_LIMIT_MAX", 600),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler("api_rate_limited"),
});

const loginLimiter = rateLimit({
  windowMs: numberEnv("LOGIN_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: numberEnv("LOGIN_RATE_LIMIT_MAX", 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username || "").trim().toLowerCase()}`,
  handler: rateLimitHandler("auth_login_rate_limited"),
});

// Per-IP ceiling in front of the IP+username limiter, so rotating usernames does not help.
const loginIpLimiter = rateLimit({
  windowMs: numberEnv("LOGIN_IP_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: numberEnv("LOGIN_IP_RATE_LIMIT_MAX", 50),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login-ip:${ipKeyGenerator(req.ip)}`,
  handler: rateLimitHandler("auth_login_ip_rate_limited"),
});

const sensitiveAuthLimiter = rateLimit({
  windowMs: numberEnv("AUTH_SENSITIVE_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
  limit: numberEnv("AUTH_SENSITIVE_RATE_LIMIT_MAX", 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitHandler("auth_sensitive_rate_limited"),
});

module.exports = { apiLimiter, loginIpLimiter, loginLimiter, sensitiveAuthLimiter };
