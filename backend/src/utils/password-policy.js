const { AppError } = require("./http-error");

const MIN_PASSWORD_LENGTH = 10;
// bcrypt only uses the first 72 bytes; longer passwords would be silently truncated.
const MAX_PASSWORD_BYTES = 72;

const validatePassword = (password, options = {}) => {
  const value = String(password || "");
  const errors = [];
  if (value.length < MIN_PASSWORD_LENGTH) errors.push(`ít nhất ${MIN_PASSWORD_LENGTH} ký tự`);
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) errors.push("độ dài phù hợp (vui lòng nhập ngắn hơn)");
  const username = String(options.username || "").trim().toLowerCase();
  if (username.length >= 3 && value.toLowerCase().includes(username)) errors.push("không chứa tên tài khoản");
  return { valid: errors.length === 0, errors };
};

const assertPasswordPolicy = (password, options) => {
  const result = validatePassword(password, options);
  if (result.valid) return;
  throw new AppError(422, `Mật khẩu phải có ${result.errors.join(", ")}`, "PASSWORD_POLICY_FAILED");
};

module.exports = {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  assertPasswordPolicy,
  validatePassword,
};
