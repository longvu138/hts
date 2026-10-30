const { fail } = require('../../utils/http-error');
const { parsePagination } = require('../../utils/pagination');
const { toDbDateTime } = require('../../utils/datetime');
const text = (value, label, max, required = true) => {
  if (!required && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(422, `${label} phải có nội dung và tối đa ${max} ký tự`);
  return value.trim();
};
const id = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) fail(422, 'Mã định danh không hợp lệ');
  return value;
};
// Returns a UTC DATETIME literal; the API always requires an explicit timezone.
const instant = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(422, 'Thời gian phải là ngày giờ hợp lệ, có múi giờ');
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || Number(timePart.slice(0, 2)) > 23 || Number(timePart.slice(3, 5)) > 59) fail(422, 'Ngày giờ không tồn tại, vui lòng kiểm tra lại');
  const d = new Date(value);
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) fail(422, 'Năm phải từ 2000 đến 2100');
  return toDbDateTime(d);
};
const overlaps = (a, b) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;
// Overlap inside one request is invalid input (422); overlap with saved data is a 409 conflict.
const assertNoSelfOverlap = rows => {
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) if (rows[i].assigneeId === rows[j].assigneeId && overlaps(rows[i], rows[j])) fail(422, 'Một người đang được chọn ở các khung giờ trùng nhau. Vui lòng sửa lịch trước khi lưu');
  return rows;
};
const segments = items => {
  if (!Array.isArray(items) || !items.length || items.length > 30) fail(422, 'Vui lòng nhập từ 1 đến 30 khung giờ');
  const rows = items.flatMap(s => {
    if (!s || typeof s !== 'object') fail(422, 'Khung giờ không hợp lệ');
    if (!Array.isArray(s.assigneeIds) || !s.assigneeIds.length || s.assigneeIds.length > 50) fail(422, 'Mỗi khung giờ cần từ 1 đến 50 người thực hiện');
    const startsAt = instant(s.startsAt),
      endsAt = instant(s.endsAt);
    if (startsAt >= endsAt) fail(422, 'Giờ kết thúc phải sau giờ bắt đầu');
    return [...new Set(s.assigneeIds.map(id))].map(assigneeId => ({
      assigneeId,
      startsAt,
      endsAt,
      content: text(s.content, 'Nội dung', 500),
      place: text(s.place, 'Nơi làm việc', 200)
    }));
  });
  if (rows.length > 100) fail(422, 'Mỗi lần lưu tối đa 100 phân công');
  return assertNoSelfOverlap(rows);
};
const version = value => {
  if (!Number.isSafeInteger(value) || value < 1) fail(422, 'Phiên bản công việc không hợp lệ, vui lòng tải lại');
  return value;
};
// Pagination only; endpoints that do not filter by time must not validate from/to.
const page = (query = {}) => {
  const { page: current, limit } = parsePagination(query, { defaultLimit: 20 });
  return { page: current, limit };
};
// Calendar range only (default: today in Vietnam).
const range = (query = {}) => {
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh'
  });
  const from = instant(query.from || `${today}T00:00:00+07:00`);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const to = instant(query.to || `${tomorrow}T00:00:00+07:00`);
  if (to <= from || Date.parse(to.replace(' ', 'T') + 'Z') - Date.parse(from.replace(' ', 'T') + 'Z') > 366 * 86400000) fail(422, 'Khoảng xem lịch phải lớn hơn 0 và không quá 366 ngày');
  return {
    from,
    to
  };
};
// The clock on the API server is authoritative; confirmation is required per request.
const requirePastStartConfirmation = (rows, confirmed, now = Date.now()) => {
  if (confirmed !== undefined && typeof confirmed !== 'boolean') fail(422, 'Xác nhận thời gian quá khứ phải là đúng hoặc sai');
  const past = rows.some(row => Date.parse(row.startsAt.replace(' ', 'T') + 'Z') < now);
  if (past && confirmed !== true) fail(409, 'Thời gian bắt đầu đã qua. Vui lòng xác nhận để tạo việc trong quá khứ', 'WORK_PAST_CONFIRMATION_REQUIRED');
  return past;
};
module.exports = {
  fail,
  text,
  id,
  instant,
  overlaps,
  assertNoSelfOverlap,
  segments,
  version,
  page,
  range,
  requirePastStartConfirmation
};
