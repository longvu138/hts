import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentsOnDay, assignmentsByPeriod, calendarRange, createdIsOnCalendar, scheduleDays, calendarRows, isWeekend } from './workCalendar.js';

test('lịch tuần bắt đầu thứ hai, mobile chỉ lấy ngày đã chọn', () => {
  assert.deepEqual(scheduleDays('2026-11-01', false), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(scheduleDays('2026-11-01', true), ['2026-11-01']);
  assert.deepEqual(calendarRange(scheduleDays('2026-11-01', true)), { from: '2026-11-01T00:00:00+07:00', to: '2026-11-02T00:00:00+07:00' });
});

test('việc qua đêm hiện đúng hai ngày, giờ kết thúc không lấn sang ngày sau', () => {
  const part = { id: 'overnight', startsAt: '2026-10-26T16:00:00Z', endsAt: '2026-10-26T18:00:00Z' };
  const midnight = { id: 'midnight', startsAt: '2026-10-26T15:00:00Z', endsAt: '2026-10-26T17:00:00Z' };
  assert.equal(assignmentsOnDay([part], '2026-10-26').length, 1);
  assert.deepEqual(assignmentsOnDay([part, midnight], '2026-10-27').map(x => x.id), ['overnight']);
  assert.deepEqual(assignmentsOnDay(null, '2026-10-27'), []);
});

test('giao việc hiện trong lịch không báo nhầm nằm ngoài bộ lọc', () => {
  const body = { segments: [{ startsAt: '2026-10-26T08:00:00+07:00', endsAt: '2026-10-26T12:00:00+07:00', place: 'Khu A', assigneeIds: ['member'] }] };
  const days = ['2026-10-26'];
  assert.equal(createdIsOnCalendar(body, days, [{ id: 'member' }]), true);
  assert.equal(createdIsOnCalendar(body, ['2026-10-27'], [{ id: 'member' }]), false);
  assert.equal(createdIsOnCalendar(body, days, [{ id: 'other' }]), false);
  assert.equal(createdIsOnCalendar(body, days, [{ id: 'member' }], 'Khu B'), false);
});

test('chia sáng chiều đúng mốc 12 giờ, việc qua buổi chỉ hiện một lần ở buổi sáng', () => {
  const make = (id, start, end) => ({ id, startsAt: `2026-10-26T${start}:00+07:00`, endsAt: `2026-10-26T${end}:00+07:00` });
  const periods = assignmentsByPeriod([make('morning', '08:00', '12:00'), make('afternoon', '12:00', '14:00'), make('both', '11:00', '13:00'), make('day', '08:00', '17:00')], '2026-10-26');
  assert.deepEqual(periods[0].items.map(item => item.id), ['morning', 'day', 'both']);
  assert.deepEqual(periods[1].items.map(item => item.id), ['afternoon']);
  assert.ok(assignmentsByPeriod(null, '2026-10-26').every(period => !period.items.length));
});

test('mỗi buổi đưa việc chưa xong lên trước để không bị việc đã xong che sau "Xem thêm"', () => {
  const make = (id, start, end, status) => ({ id, status, startsAt: `2026-10-26T${start}:00+07:00`, endsAt: `2026-10-26T${end}:00+07:00` });
  const [morning] = assignmentsByPeriod([
    make('done-early', '07:30', '08:30', 'completed'),
    make('pending-late', '09:30', '10:30', 'assigned'),
    make('forwarded', '08:00', '09:00', 'transferred'),
    make('pending-early', '09:00', '09:30', 'assigned'),
  ], '2026-10-26');
  assert.deepEqual(morning.items.map(item => item.id), ['pending-early', 'pending-late', 'done-early', 'forwarded']);
});

test('gom người không có việc trong các ngày đang xem', () => {
  const busy = { id: 'busy', assignments: [{ id: 'a', startsAt: '2026-10-27T01:00:00Z', endsAt: '2026-10-27T03:00:00Z' }] };
  const other = { id: 'other-week', assignments: [{ id: 'b', startsAt: '2026-11-10T01:00:00Z', endsAt: '2026-11-10T03:00:00Z' }] };
  const days = scheduleDays('2026-10-27', false);
  const result = calendarRows([busy, { id: 'free' }, other, null], days);
  assert.deepEqual(result.busy.map(person => person.id), ['busy']);
  assert.deepEqual(result.free.map(person => person.id), ['free', 'other-week']);
  // Periods are computed once per person × day and keep only periods that have work.
  assert.deepEqual(Object.keys(result.periods.get('busy')), days);
  assert.deepEqual(result.periods.get('busy')['2026-10-27'].map(period => period.key), ['morning']);
  assert.deepEqual(result.periods.get('busy')['2026-10-28'], []);
  assert.equal(calendarRows(null, days).busy.length, 0);
});

test('nhận diện cuối tuần đúng cả thứ Bảy, Chủ nhật và ngày trong tuần', () => {
  assert.equal(isWeekend('2026-10-24'), true);
  assert.equal(isWeekend('2026-10-25'), true);
  assert.equal(isWeekend('2026-10-26'), false);
  assert.equal(isWeekend('2026-10-28'), false);
  assert.equal(isWeekend('ngày không hợp lệ'), false);
});
