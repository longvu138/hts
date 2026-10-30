const { assertPasswordPolicy } = require("../../utils/password-policy");
const { httpError } = require("../../utils/http-error");

const validateAccountInput = (body = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(422, "Thông tin tài khoản không hợp lệ");
  if (typeof body.username !== "string" || !body.username.trim() || typeof body.password !== "string" || !body.password) {
    throw httpError(422, "Tên tài khoản và mật khẩu là bắt buộc");
  }
  const username = body.username.trim();
  if (username.length > 191) throw httpError(422, "Tên tài khoản quá dài");
  assertPasswordPolicy(body.password, { username });
  const normalized = { ...body, username };
  const optionalFields = { code: [50, "Mã cán bộ"], fullName: [150, "Họ tên"], position: [150, "Chức vụ"], departmentId: [36, "Đơn vị"], phone: [30, "Số điện thoại"], email: [191, "Email"] };
  for (const [field, [limit, label]] of Object.entries(optionalFields)) {
    const value = body[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || value.length > limit) throw httpError(422, `${label} phải là chuỗi ký tự tối đa ${limit} ký tự`);
    normalized[field] = value.trim();
  }
  if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) throw httpError(422, "Email không đúng định dạng");
  if ((normalized.code || username).length > 50) throw httpError(422, "Vui lòng cung cấp mã cán bộ tối đa 50 ký tự cho tên tài khoản dài");
  return normalized;
};

const validatePasswordInput = (body = {}, { change = false, username } = {}) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw httpError(422, "Thông tin mật khẩu không hợp lệ");
  const password = change ? body.newPassword : body.password;
  if (typeof password !== "string" || !password || typeof body.confirmPassword !== "string" || (change && (typeof body.currentPassword !== "string" || !body.currentPassword))) {
    throw httpError(422, change ? "Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới" : "Vui lòng nhập mật khẩu tạm và xác nhận mật khẩu");
  }
  if (password !== body.confirmPassword) throw httpError(422, "Mật khẩu xác nhận không khớp");
  assertPasswordPolicy(password, { username });
  return password;
};
const validateLoginInput = (body = {}) => {
  if (!body || typeof body.username !== "string" || !body.username.trim() || typeof body.password !== "string" || !body.password) {
    throw httpError(422, "Tên tài khoản và mật khẩu là bắt buộc");
  }
  return { username: body.username.trim(), password: body.password };
};
module.exports = { httpError, validateAccountInput, validatePasswordInput, validateLoginInput };
