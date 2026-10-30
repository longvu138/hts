const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('./work.validator');
const a = '00000000-0000-4000-8000-000000000001';
const segment = {
  content: 'Kiểm tra',
  place: 'Khu A',
  startsAt: '2026-10-24T08:00:00+07:00',
  endsAt: '2026-10-24T12:00:00+07:00',
  assigneeIds: [a]
};
test('lịch liền giờ hợp lệ, đổi về UTC và chặn trùng ngay trong yêu cầu', () => {
  const rows = v.segments([segment, {
    ...segment,
    startsAt: segment.endsAt,
    endsAt: '2026-10-24T17:00:00+07:00'
  }]);
  assert.equal(rows[0].startsAt, '2026-10-24 01:00:00');
  assert.equal(v.overlaps(rows[0], rows[1]), false);
  assert.throws(() => v.segments([segment, segment]), e => e.statusCode === 422, 'trùng trong cùng yêu cầu là dữ liệu sai');
});
test('validation chặn thời gian thiếu múi giờ, đoạn ngược và dữ liệu sai', () => {
  for (const change of [{
    assigneeIds: []
  }, {
    startsAt: '2026-10-24T08:00'
  }, {
    endsAt: segment.startsAt
  }, {
    place: ''
  }, {
    startsAt: '2026-02-30T08:00:00+07:00'
  }, {
    startsAt: '2026-10-24T24:00:00+07:00'
  }, {
    content: null
  }]) assert.throws(() => v.segments([{
    ...segment,
    ...change
  }]), e => e.statusCode === 422);
  assert.throws(() => v.range({
    from: '2026-01-01T00:00Z',
    to: '2027-01-03T00:00Z'
  }), e => e.statusCode === 422);
});

test('khoảng xem hỗ trợ từ đầu năm và cả năm nhuận, chặn vượt 366 ngày', () => {
  assert.ok(v.range({ from: '2026-01-01T00:00:00+07:00', to: '2026-10-25T00:00:00+07:00' }));
  assert.ok(v.range({ from: '2028-01-01T00:00:00+07:00', to: '2029-01-01T00:00:00+07:00' }));
  assert.throws(() => v.range({ from: '2028-01-01T00:00:00+07:00', to: '2029-01-02T00:00:00+07:00' }), e => e.statusCode === 422);
});

test('phân trang công việc không kiểm tra khoảng ngày và kẹp limit theo quy tắc chung', () => {
  assert.deepEqual(v.page({ page: '0', limit: '500', from: 'không phải ngày' }), { page: 1, limit: 100 });
  assert.deepEqual(v.page({}), { page: 1, limit: 20 });
  assert.equal(Object.hasOwn(v.range({}), 'page'), false);
});

test('14 giờ vẫn cho tạo lịch 8 giờ cùng ngày sau xác nhận, tương lai không cần xác nhận', () => {
  const now = Date.parse('2026-10-28T14:00:00+07:00');
  const past = v.segments([{ ...segment, startsAt: '2026-10-28T08:00:00+07:00', endsAt: '2026-10-28T11:30:00+07:00' }]);
  assert.throws(() => v.requirePastStartConfirmation(past, undefined, now), error => error.statusCode === 409 && error.code === 'WORK_PAST_CONFIRMATION_REQUIRED');
  assert.equal(v.requirePastStartConfirmation(past, true, now), true);
  assert.throws(() => v.requirePastStartConfirmation(past, 'true', now), error => error.statusCode === 422);
  const future = v.segments([{ ...segment, startsAt: '2026-10-28T15:00:00+07:00', endsAt: '2026-10-28T17:00:00+07:00' }]);
  assert.equal(v.requirePastStartConfirmation(future, undefined, now), false);
});
