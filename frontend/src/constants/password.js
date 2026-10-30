// Đồng bộ với backend/src/utils/password-policy.js.
export const PASSWORD_MIN_LENGTH = 10;
// bcrypt chỉ dùng 72 byte đầu (UTF-8).
export const PASSWORD_MAX_BYTES = 72;
// Backend chỉ kiểm tra "chứa tên tài khoản" khi tên tài khoản (đã trim) có từ 3 ký tự.
export const PASSWORD_USERNAME_MIN_LENGTH = 3;

// Quy tắc mật khẩu theo backend; `key` khớp với kết quả getPasswordChecks (utils/passwordPolicy.js).
export const PASSWORD_RULES = Object.freeze([
  { key: "minLength", text: `Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`, error: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự` },
  { key: "noUsername", text: "Không chứa tên đăng nhập", error: "Mật khẩu không được chứa tên đăng nhập" },
  { key: "maxBytes", error: "Mật khẩu quá dài. Vui lòng nhập ngắn hơn." },
]);
