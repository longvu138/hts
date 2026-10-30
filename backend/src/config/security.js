const crypto = require("crypto");

const MIN_SECRET_LENGTH = 32;
// Values shipped in example files or seen in old configs; never accepted in production.
const KNOWN_PLACEHOLDERS = new Set([
  "change_me_to_a_long_random_secret",
  "replace-with-a-long-random-secret",
  "replace-with-a-separate-random-secret",
  "replace-with-a-random-bootstrap-token",
  "generate_jwt_secret",
  "generate_csrf_secret",
  "generate_bootstrap_token",
  "secret",
  "changeme",
  "ntdls",
]);

const isPlaceholder = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return KNOWN_PLACEHOLDERS.has(normalized) || /^(change|replace|generate)[-_]/.test(normalized);
};

const isProduction = (env = process.env) => env.NODE_ENV === "production";

const describeSecretProblem = (name, value) => {
  if (!value) return `${name} chưa được cấu hình`;
  if (value.length < MIN_SECRET_LENGTH) return `${name} phải dài tối thiểu ${MIN_SECRET_LENGTH} ký tự`;
  if (isPlaceholder(value)) return `${name} đang dùng giá trị mẫu`;
  return null;
};

// Returns the list of problems; production startup refuses to continue when it is not empty.
const validateSecuritySecrets = (env = process.env) => {
  const problems = [
    describeSecretProblem("JWT_SECRET", env.JWT_SECRET),
    describeSecretProblem("CSRF_SECRET", env.CSRF_SECRET),
  ].filter(Boolean);
  if (env.JWT_SECRET && env.CSRF_SECRET && env.JWT_SECRET === env.CSRF_SECRET) {
    problems.push("JWT_SECRET và CSRF_SECRET phải khác nhau");
  }
  if (env.BOOTSTRAP_TOKEN) {
    const problem = describeSecretProblem("BOOTSTRAP_TOKEN", env.BOOTSTRAP_TOKEN);
    if (problem) problems.push(problem);
  }
  return problems;
};

const assertSecuritySecrets = (env = process.env) => {
  const problems = validateSecuritySecrets(env);
  if (problems.length && isProduction(env)) {
    throw new Error(`Cấu hình bảo mật production không hợp lệ: ${problems.join("; ")}`);
  }
  return problems;
};

// CSRF tokens are signed with their own key. Outside production a missing CSRF_SECRET is
// replaced by a key derived (not copied) from JWT_SECRET so local .env files keep working.
const getCsrfSecret = (env = process.env) => {
  if (env.CSRF_SECRET) return env.CSRF_SECRET;
  if (isProduction(env) || !env.JWT_SECRET) return "";
  return crypto.createHmac("sha256", env.JWT_SECRET).update("hts-development-csrf-key-v1").digest("base64url");
};

module.exports = {
  MIN_SECRET_LENGTH,
  assertSecuritySecrets,
  getCsrfSecret,
  isPlaceholder,
  validateSecuritySecrets,
};
