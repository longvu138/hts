import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkFilters, patchWorkFilters, createdWorkIsHidden, workQueryParams, activeWorkFilterCount, lastPage } from './workFilters.js';
const config = { canAssign: true, canView: true, canPeople: true, defaults: { from: '2026-10-24', to: '2026-10-24', at: '2026-10-24T09:00' } };
const person = '00000000-0000-4000-8000-000000000012';
test('URL khôi phục ngày, bộ lọc và trang; patch giữ nguyên chi tiết', () => {
  const params = new URLSearchParams(`view=given&from=2026-11-01&to=2026-11-15&q=Hồ+sơ&status=assigned&assigneeId=${person}&page=2&workId=keep`);
  const filters = readWorkFilters(params, config);
  assert.equal(filters.from, '2026-11-01'); assert.equal(filters.to, '2026-11-15'); assert.equal(filters.q, 'Hồ sơ'); assert.equal(filters.assigneeId, person); assert.equal(filters.page, 2);
  const next = patchWorkFilters(params, { q: '', page: 1 });
  assert.equal(next.get('workId'), 'keep'); assert.equal(next.has('q'), false); assert.equal(next.has('page'), false);
});
test('URL sai và phạm vi không được phép không đi vào API', () => {
  const filters = readWorkFilters(new URLSearchParams(`view=situation&from=2026-02-30&to=9999-01-01&at=2026-10-24T99:00&page=-5&status=bad&assigneeId=${person}&departmentId=bad`), { ...config, canView: false, canPeople: false });
  assert.equal(filters.mode, 'mine'); assert.equal(filters.from, '2026-10-24'); assert.equal(filters.to, filters.from); assert.equal(filters.at, config.defaults.at); assert.equal(filters.page, 1); assert.equal(filters.status, undefined); assert.equal(filters.assigneeId, undefined); assert.equal(filters.departmentId, undefined);
  assert.equal(readWorkFilters(new URLSearchParams('from=2026-01-01&to=2027-02-01'), config).to, '2026-01-01');
  assert.equal(readWorkFilters(new URLSearchParams('from=2026-01-01&to=2027-01-01'), config).to, '2027-01-01');
  assert.equal(readWorkFilters(new URLSearchParams('from=2026-01-05&to=2026-01-01'), config).to, '2026-01-05');
});
test('phát hiện việc tạo nằm ngoài ngày, tên, trạng thái, người và loại xem', () => {
  const body = { title: 'Hồ sơ', segments: [{ startsAt: '2026-10-24T08:00:00+07:00', endsAt: '2026-10-24T11:30:00+07:00', assigneeIds: ['me'] }] };
  const filters = readWorkFilters(new URLSearchParams(), config);
  assert.equal(createdWorkIsHidden(body, filters, 'me'), false);
  for (const patch of [{ from: '2026-11-01', to: '2026-11-01' }, { status: 'completed' }, { q: 'Không khớp' }, { assigneeId: person }, { mode: 'situation' }, { page: 2 }]) assert.equal(createdWorkIsHidden(body, { ...filters, ...patch }, 'me'), true);
  assert.equal(createdWorkIsHidden(body, filters, 'another'), true);
  // Việc bắt đầu đúng 00:00 ngày sau nằm ngoài; việc kết thúc đúng 00:00 ngày đầu cũng ngoài.
  assert.equal(createdWorkIsHidden({ ...body, segments: [{ ...body.segments[0], startsAt: '2026-10-25T00:00:00+07:00', endsAt: '2026-10-25T01:00:00+07:00' }] }, filters, 'me'), true);
  assert.equal(createdWorkIsHidden({ ...body, segments: [{ ...body.segments[0], startsAt: '2026-10-24T23:00:00+07:00', endsAt: '2026-10-25T01:00:00+07:00' }] }, filters, 'me'), false);
  assert.equal(createdWorkIsHidden({ ...body, segments: [{ ...body.segments[0], startsAt: '2026-10-23T22:00:00+07:00', endsAt: '2026-10-24T00:00:00+07:00' }] }, filters, 'me'), true);
});
test('cỡ trang theo tùy chọn chung, tham số API dùng giờ Việt Nam và đếm bộ lọc thêm', () => {
  const pageSizes = [25, 50, 100];
  assert.equal(readWorkFilters(new URLSearchParams('pageSize=50'), { ...config, pageSizes }).pageSize, 50);
  assert.equal(readWorkFilters(new URLSearchParams('pageSize=7'), { ...config, pageSizes }).pageSize, 25);
  assert.equal(patchWorkFilters(new URLSearchParams('pageSize=50'), { pageSize: 25 }).has('pageSize'), false);
  const filters = readWorkFilters(new URLSearchParams('from=2026-11-01&to=2026-11-03&status=transferred'), { ...config, pageSizes });
  assert.equal(filters.status, 'transferred');
  assert.deepEqual(workQueryParams(filters, { canFilterPeople: false }), { from: '2026-11-01T00:00:00+07:00', to: '2026-11-04T00:00:00+07:00', q: undefined, status: 'transferred', assigneeId: undefined, page: 1, limit: 25 });
  assert.equal(workQueryParams({ ...filters, mode: 'situation' }, {}).at, '2026-10-24T09:00:00+07:00');
  assert.equal(activeWorkFilterCount({ ...filters, q: ' a ' }), 2);
  // Lịch đơn vị: người thực hiện nằm ở thanh công cụ nên không tính vào "Lọc thêm".
  assert.equal(activeWorkFilterCount({ mode: 'situation', assigneeId: person, place: 'Khu A' }), 1);
  assert.equal(activeWorkFilterCount({ mode: 'given', assigneeId: person }), 1);
  assert.equal(lastPage(41, 25), 2); assert.equal(lastPage(0, 25), 1);
});

test('chỉ quyền xem tình hình không được mở việc đã giao bằng URL', () => {
  const filters = readWorkFilters(new URLSearchParams(`view=given&assigneeId=${person}`), { ...config, canAssign: false, canPeople: false });
  assert.equal(filters.mode, 'mine'); assert.equal(filters.assigneeId, undefined);
});

test('lịch đơn vị chọn đúng mã người với quyền chỉ xem và không dùng tìm tên cũ', () => {
  const filters = readWorkFilters(new URLSearchParams(`view=situation&assigneeId=${person}&q=Tên+cũ`), { ...config, canAssign: false, canPeople: false });
  assert.equal(filters.assigneeId, person);
  assert.equal(filters.q, '');
  assert.equal(workQueryParams(filters, {}).assigneeId, person);
  assert.equal(readWorkFilters(new URLSearchParams('view=situation&assigneeId=bad'), config).assigneeId, undefined);
});
