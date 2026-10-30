import test from 'node:test';
import assert from 'node:assert/strict';
import { isForwardedByMe, situationCounts, sortHistory, workPartActions } from './workParts.js';
test('thao tác phần việc theo quyền và trạng thái', () => {
  const item = { assigneeId: 'me', giverId: 'me', status: 'assigned', source: 'self' };
  assert.deepEqual(workPartActions(item, { userId: 'me', canSelf: true }), { complete: true, transfer: false, edit: true, cancel: true });
  assert.deepEqual(workPartActions({ ...item, source: 'assigned', giverId: 'boss' }, { userId: 'me', canAssign: true }), { complete: true, transfer: true, edit: false, cancel: false });
  assert.deepEqual(workPartActions({ ...item, status: 'transferred' }, { userId: 'me', canAssign: true }), { complete: false, transfer: false, edit: false, cancel: true });
  assert.equal(isForwardedByMe({ ...item, status: 'transferred' }, 'me'), true);
  assert.equal(isForwardedByMe({ ...item, status: 'transferred' }, 'other'), false);
});
test('đếm tình hình và sắp lịch sử theo thời gian ổn định', () => {
  assert.deepEqual(situationCounts([{ status: 'scheduled' }, { status: 'free' }, { status: 'free' }, null, { status: 'x' }]), { scheduled: 1, free: 2, completed: 0 });
  const history = [{ id: 'c', createdAt: '2026-10-24T03:00:00Z' }, { id: 'b2', createdAt: '2026-10-24T02:00:00Z' }, { id: 'b1', createdAt: '2026-10-24T02:00:00Z' }, { id: 'a', createdAt: '2026-10-24T01:00:00Z' }];
  assert.deepEqual(sortHistory(history).map(e => e.id), ['a', 'b1', 'b2', 'c']);
  assert.deepEqual(sortHistory(null), []);
});
