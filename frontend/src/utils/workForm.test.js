import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPastWorkStart, workFormBody, workFormInitial, workFormTimes, workAvailabilityBody, pickFreePeriod, workDayProbeBody, errorScrollOptions, probeCovers, conflictsWithin, defaultPeriodFor, workDayBusyBody, workBusyHints } from './workForm.js';
test('buổi sáng, chiều, cả ngày sinh đúng giờ Việt Nam trong một phân công', () => {
  for (const [period, start, end] of [['morning','08:00','11:30'],['afternoon','13:30','17:00'],['day','08:00','17:00']]) {
    assert.deepEqual(workFormTimes({ date:'2026-10-24', period }), { startsAt:`2026-10-24T${start}:00+07:00`, endsAt:`2026-10-24T${end}:00+07:00` });
  }
});
test('tùy chọn hỗ trợ qua ngày, tạo một lần và nhận diện tự tạo', () => {
  const values={ name:' Kiểm tra ',place:' Khu A ',date:'2026-10-24',endDate:'2026-10-25',period:'custom',startTime:'23:00',endTime:'01:00',assigneeIds:['self'] };
  const body=workFormBody(values,{mode:'create',userId:'self',canSelf:true});
  assert.equal(body.source,'self'); assert.equal(body.title,'Kiểm tra'); assert.equal(body.segments.length,1); assert.equal(body.segments[0].endsAt,'2026-10-25T01:00:00+07:00');
  assert.equal(workFormBody({...values,assigneeIds:['other']},{mode:'create',userId:'self',canSelf:true}).source,'assigned');
});
test('sửa lịch có sẵn nhận diện buổi đúng và giữ lịch tùy chọn qua ngày', () => {
  assert.equal(workFormInitial({startsAt:'2026-10-24T06:30:00Z',endsAt:'2026-10-24T10:00:00Z',assigneeId:'a'},'a').period,'afternoon');
  assert.equal(workFormInitial({startsAt:'2026-10-24T16:00:00Z',endsAt:'2026-10-24T18:00:00Z',assigneeId:'a'},'a').period,'custom');
});
test('tạo mới dùng ngày đang xem; sửa giữ nguyên lịch hiện hữu và đổi tên phần việc', () => {
  const initial = workFormInitial(null, 'me', '2026-11-15');
  assert.equal(initial.date, '2026-11-15'); assert.equal(initial.endDate, '2026-11-15');
  const item = { id: 'part', version: 2, title: 'Tên chung', content: 'Tên cũ', startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T04:30:00Z', assigneeId: 'me', place: 'A' };
  const values = { ...workFormInitial(item, 'me', '2026-11-15'), name: 'Tên mới' };
  assert.equal(values.date, '2026-10-24');
  assert.equal(workFormBody(values, { mode: 'edit', item, userId: 'me' }).segments[0].content, 'Tên mới');
});

test('kiểm tra lịch dùng người và giờ, không cần nhập tên/địa điểm; loại lịch cũ đúng chế độ', () => {
  const values = { ...workFormInitial(null, 'me', '2026-11-15'), name: '', place: '' };
  assert.equal(workAvailabilityBody(values, { mode: 'create', userId: 'me', canSelf: true }).source, 'self');
  assert.equal(workAvailabilityBody({ ...values, assigneeIds: [] }, { mode: 'create' }), null);
  assert.equal(workAvailabilityBody({ ...values, period: 'custom', startTime: '12:00', endTime: '08:00' }, { mode: 'create' }), null);
  const body = workAvailabilityBody(values, { mode: 'edit', item: { id: 'old', source: 'assigned' }, userId: 'me' });
  assert.equal(body.excludeAssignmentId, 'old'); assert.equal(body.action, 'edit');
});

test('chuyển việc bắt đầu trống; giữ một phần cho tôi là lựa chọn riêng', () => {
  const item = { id: 'part', version: 1, title: 'Chung', content: 'Phần', startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T04:30:00Z', assigneeId: 'me', place: 'A', source: 'assigned' };
  const initial = workFormInitial(item, 'me', '2026-10-24', 'transfer');
  assert.deepEqual(initial.assigneeIds, []); assert.equal(initial.keepForMe, false);
  assert.equal(workAvailabilityBody(initial, { mode: 'transfer', item, userId: 'me' }), null);
  const values = { ...initial, assigneeIds: ['other', 'me'] };
  assert.deepEqual(workFormBody(values, { mode: 'transfer', item, userId: 'me' }).segments[0].assigneeIds, ['other']);
  assert.deepEqual(workFormBody({ ...values, keepForMe: true }, { mode: 'transfer', item, userId: 'me' }).segments[0].assigneeIds, ['other', 'me']);
});

test('chọn buổi trống đầu tiên cho lịch tự tạo', () => {
  const morning = { startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T04:00:00Z' };
  assert.equal(pickFreePeriod('2026-10-24', []), 'morning');
  assert.equal(pickFreePeriod('2026-10-24', [morning]), 'afternoon');
  assert.equal(pickFreePeriod('2026-10-24', [morning, { startsAt: '2026-10-24T07:00:00Z', endsAt: '2026-10-24T08:00:00Z' }]), null);
  assert.equal(pickFreePeriod('2026-10-24', null), 'morning');
  const probe = workDayProbeBody('2026-10-24', 'me');
  assert.equal(probe.segments[0].startsAt, '2026-10-24T08:00:00+07:00'); assert.equal(probe.segments[0].endsAt, '2026-10-24T17:00:00+07:00');
});

test("cuộn tới lỗi không focus trên màn cảm ứng để bàn phím/bảng chọn không che thông báo", () => {
  assert.deepEqual(errorScrollOptions((query) => ({ matches: query === "(pointer: coarse)" })), { focus: false, block: "center" });
  assert.deepEqual(errorScrollOptions(() => ({ matches: false })), { focus: true, block: "center" });
  assert.deepEqual(errorScrollOptions(undefined), { focus: true, block: "center" });
});

test('một lần dò cả ngày trả lời luôn kiểm tra buổi sáng/chiều, không cần gọi thêm', () => {
  const probe = workDayProbeBody('2026-10-24', ['a', 'b'], 'assigned');
  assert.deepEqual(probe.segments[0].assigneeIds, ['a', 'b']); assert.equal(probe.source, 'assigned');
  assert.equal(workDayProbeBody('2026-10-24', []), null);
  const values = { ...workFormInitial(null, 'me', '2026-10-24'), assigneeIds: ['a'] };
  const morning = workAvailabilityBody(values, { mode: 'create', userId: 'me', canSelf: true });
  assert.equal(probeCovers(probe, morning), true);
  assert.equal(probeCovers(probe, workAvailabilityBody({ ...values, assigneeIds: ['c'] }, { mode: 'create', userId: 'me' })), false);
  assert.equal(probeCovers(probe, workAvailabilityBody({ ...values, period: 'custom', startTime: '18:00', endTime: '19:00' }, { mode: 'create', userId: 'me' })), false);
  assert.equal(probeCovers(workDayProbeBody('2026-10-24', 'me'), workAvailabilityBody({ ...values, assigneeIds: ['me'] }, { mode: 'create', userId: 'me', canSelf: true })), true);
  assert.equal(probeCovers(null, morning), false);
  const conflicts = [
    { assigneeId: 'a', startsAt: '2026-10-24T08:00:00+07:00', endsAt: '2026-10-24T09:00:00+07:00' },
    { assigneeId: 'a', startsAt: '2026-10-24T14:00:00+07:00', endsAt: '2026-10-24T15:00:00+07:00' },
    { assigneeId: 'b', startsAt: '2026-10-24T08:00:00+07:00', endsAt: '2026-10-24T09:00:00+07:00' },
    null,
  ];
  assert.equal(conflictsWithin(conflicts, morning.segments[0]).length, 1);
  assert.deepEqual(conflictsWithin(null, morning.segments[0]), []);
});

test('giao việc: mặc định buổi sáng, chỉ đổi khi mọi người được chọn đều bận buổi sáng', () => {
  const busyMorning = id => ({ assigneeId: id, startsAt: '2026-10-24T08:00:00+07:00', endsAt: '2026-10-24T11:30:00+07:00' });
  assert.equal(defaultPeriodFor('2026-10-24', ['a', 'b'], [busyMorning('a')]), 'morning');
  assert.equal(defaultPeriodFor('2026-10-24', ['a', 'b'], [busyMorning('a'), busyMorning('b')]), 'afternoon');
  assert.equal(defaultPeriodFor('2026-10-24', ['a'], [busyMorning('a'), { assigneeId: 'a', startsAt: '2026-10-24T13:30:00+07:00', endsAt: '2026-10-24T17:00:00+07:00' }]), 'morning');
  assert.equal(defaultPeriodFor('2026-10-24', [], [busyMorning('a')]), 'morning');
  assert.equal(defaultPeriodFor('2026-10-24', 'me', null), 'morning');
});

test('gợi ý bận trong danh sách người nhận theo cả ngày đã chọn', () => {
  const body = workDayBusyBody('2026-10-24', ['a', 'b']);
  assert.deepEqual(body.segments[0], { startsAt: '2026-10-24T00:00:00+07:00', endsAt: '2026-10-25T00:00:00+07:00', assigneeIds: ['a', 'b'] });
  assert.equal(workDayBusyBody('2026-10-24', ['a'], { mode: 'transfer', item: { id: 'part' } }).excludeAssignmentId, 'part');
  assert.equal(workDayBusyBody('2026-10-24', []), null);
  const hints = workBusyHints([
    { assigneeId: 'a', startsAt: '2026-10-24T06:30:00Z', endsAt: '2026-10-24T10:00:00Z' },
    { assigneeId: 'a', startsAt: '2026-10-24T01:00:00Z', endsAt: '2026-10-24T04:30:00Z' },
    { assigneeId: 'a', startsAt: '2026-10-24T11:00:00Z', endsAt: '2026-10-24T12:00:00Z' },
    { assigneeId: 'b', startsAt: 'bad', endsAt: null },
  ]);
  assert.equal(hints.get('a'), 'bận 08:00–11:30, 13:30–17:00, …');
  assert.equal(hints.has('b'), false);
  assert.equal(workBusyHints(null).size, 0);
});

test('nhận diện giờ bắt đầu quá khứ cùng ngày hoặc khác ngày theo thời điểm Việt Nam', () => {
  const now = Date.parse('2026-10-28T14:00:00+07:00');
  const body = startsAt => ({ segments: [{ startsAt }] });
  assert.equal(hasPastWorkStart(body('2026-10-28T08:00:00+07:00'), now), true);
  assert.equal(hasPastWorkStart(body('2026-10-27T15:00:00+07:00'), now), true);
  assert.equal(hasPastWorkStart(body('2026-10-28T07:00:00Z'), now), false);
  assert.equal(hasPastWorkStart(body('2026-10-28T15:00:00+07:00'), now), false);
  assert.equal(hasPastWorkStart(null, now), false);
});
