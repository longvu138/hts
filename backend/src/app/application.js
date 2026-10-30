const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { isOriginAllowed } = require("../utils/cors-origin");

const routes = require("./routes");
const { httpError } = require("../utils/http-error");
const {
  errorHandler,
  notFoundHandler,
} = require("../middlewares/error.middleware");
const {
  accessLog,
  requestContext,
} = require("../middlewares/request-context.middleware");
const { apiLimiter } = require("../middlewares/rate-limit.middleware");

const app = express();

const allowedOrigins = String(
  process.env.CORS_ALLOWED_ORIGINS ??
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3109,http://localhost:4174"),
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set(
    "trust proxy",
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
  );
}

app.use(helmet());
app.use(requestContext);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});
app.use(
  cors((req, done) => done(null, {
    origin(origin, callback) {
      if (isOriginAllowed(req, origin, allowedOrigins, process.env.CORS_ALLOW_SAME_ORIGIN === "true"))
        return callback(null, true);
      return callback(httpError(403, "Nguồn truy cập không được phép", "CORS_ORIGIN_DENIED"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "X-CSRF-Token",
      "X-Request-Id",
      "Idempotency-Key",
    ],
    exposedHeaders: ["X-Request-Id"],
    credentials: true,
    maxAge: 600,
  })),
);
app.use(express.json({ limit: process.env.REQUEST_BODY_LIMIT || "1mb" }));
app.use(
  express.urlencoded({
    extended: false,
    limit: process.env.REQUEST_BODY_LIMIT || "1mb",
    parameterLimit: Number(process.env.REQUEST_PARAMETER_LIMIT || 100),
  }),
);
app.use(accessLog);

app.use("/api", apiLimiter, routes);

app.get("/", (req, res) => {
  res.json({
    message: "Backend API is running",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
