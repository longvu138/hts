const crypto = require("crypto");
const { getCsrfSecret } = require("../config/security");
const { AppError } = require("./http-error");

const isProduction = process.env.NODE_ENV === "production";
const AUTH_COOKIE_NAME =
  process.env.AUTH_COOKIE_NAME ||
  (isProduction ? "__Host-hts_session" : "hts_session");

const parseCookies = (req) => {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return cookies;
    const name = item.slice(0, separator).trim();
    if (!name) return cookies;
    const value = item.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
};

const isCookieSecure = () => {
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  return isProduction;
};

const getSameSite = () => {
  const value = String(process.env.AUTH_COOKIE_SAME_SITE || "lax").toLowerCase();
  return ["strict", "lax", "none"].includes(value) ? value : "lax";
};

const getCookieOptions = () => ({
  httpOnly: true,
  secure: isCookieSecure(),
  sameSite: getSameSite(),
  path: "/",
});

const getAuthToken = (req) => parseCookies(req)[AUTH_COOKIE_NAME] || null;

const setAuthCookie = (res, token, expiresAt) => {
  res.cookie(AUTH_COOKIE_NAME, token, {
    ...getCookieOptions(),
    expires: new Date(expiresAt),
    maxAge: Math.max(0, new Date(expiresAt).getTime() - Date.now()),
  });
};

const clearAuthCookie = (res) => {
  res.clearCookie(AUTH_COOKIE_NAME, getCookieOptions());
};


const createCsrfToken = (sessionId) => {
  if (!getCsrfSecret()) {
    throw new AppError(500, "Chưa cấu hình khóa CSRF_SECRET");
  }
  const nonce = crypto.randomBytes(32).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getCsrfSecret())
    .update(`${sessionId}.${nonce}`)
    .digest("base64url");
  return `${nonce}.${signature}`;
};

const verifyCsrfToken = (sessionId, token) => {
  if (!sessionId || !token || !getCsrfSecret()) return false;
  const [nonce, signature, extra] = String(token).split(".");
  if (!nonce || !signature || extra) return false;
  const expected = crypto
    .createHmac("sha256", getCsrfSecret())
    .update(`${sessionId}.${nonce}`)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

module.exports = {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  createCsrfToken,
  getAuthToken,
  setAuthCookie,
  verifyCsrfToken,
};
