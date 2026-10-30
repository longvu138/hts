import test from 'node:test';
import assert from 'node:assert/strict';
import { dayEnd, nowInput, rangeTooLong, shortTimeRange, showTimeRange, timeRangeParts, weekStart, workDatePresets } from './workTime.js';
test('mốc nhanh theo giờ Việt Nam, tuần từ thứ hai, có mốc tương lai và năm nhuận', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2028-03-01T01:00:00Z') });
  const ranges = Object.fromEntries(workDatePresets().map(p => [p.label, p.value().map(d => d.format('YYYY-MM-DD'))]));
  assert.deepEqual(ranges['Hôm nay'], ['2028-03-01', '2028-03-01']);
  assert.deepEqual(ranges['Ngày mai'], ['2028-03-02', '2028-03-02']);
  assert.deepEqual(ranges['Hôm qua'], ['2028-02-29', '2028-02-29']);
  assert.deepEqual(ranges['Tuần này'], ['2028-02-28', '2028-03-05']);
  assert.deepEqual(ranges['Tuần sau'], ['2028-03-06', '2028-03-12']);
  assert.deepEqual(ranges['Tuần trước'], ['2028-02-21', '2028-02-27']);
  assert.deepEqual(ranges['Tháng này'], ['2028-03-01', '2028-03-31']);
  t.mock.timers.tick(86400000);
  assert.deepEqual(workDatePresets()[0].value().map(d => d.format('YYYY-MM-DD')), ['2028-03-02', '2028-03-02']);
});
test('giờ xem mặc định làm tròn xuống 15 phút; khoảng giờ hiển thị gọn', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-24T02:44:59Z') });
  assert.equal(nowInput(), '2026-10-24T09:30');
  const parts = timeRangeParts('2026-10-24T01:00:00Z', '2026-10-24T04:30:00Z');
  assert.match(parts.time, /08:00 – 11:30/); assert.equal(parts.day, '24/10/2026');
  assert.match(timeRangeParts('2026-10-24T16:00:00Z', '2026-10-24T18:00:00Z').day, /→/);
  assert.equal(showTimeRange('bad', null), '—');
});
test('đầu tuần là thứ hai, cuối ngày là đầu ngày sau, khoảng tối đa 365 ngày', () => {
  assert.equal(weekStart('2026-11-01'), '2026-10-26');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(weekStart('2028-03-01'), '2028-02-28');
  assert.equal(dayEnd('2026-12-31'), '2027-01-01T00:00:00+07:00');
  assert.equal(rangeTooLong('2026-01-01', '2027-01-01'), false);
  assert.equal(rangeTooLong('2026-01-01', '2027-01-02'), true);
  assert.equal(rangeTooLong('2027-01-02', '2026-01-01'), true);
});
test('giờ trên lịch gọn, việc qua ngày thêm ngày bắt đầu và kết thúc', () => {
  assert.match(shortTimeRange('2026-10-24T01:00:00Z', '2026-10-24T04:30:00Z'), /^08:00 – 11:30$/);
  assert.match(shortTimeRange('2026-10-24T16:00:00Z', '2026-10-24T18:00:00Z'), /^23:00 – 01:00 \(24\/10–25\/10\)$/);
  assert.equal(shortTimeRange(null, 'bad'), '—');
});
