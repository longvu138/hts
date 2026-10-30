import assert from "node:assert/strict";
import test from "node:test";
import { getNotificationTarget } from "./notificationTarget.js";

test("thông báo lịch sử của phân hệ đã gỡ trở về tổng quan", () => {
  assert.equal(getNotificationTarget({ entityType: "task", entityId: "task 1", type: "task.assigned" }), "/");
  assert.equal(getNotificationTarget({ entityType: "task", entityId: "task-2", type: "personal_work.sla_overdue" }), "/");
  assert.equal(getNotificationTarget({}), "/");
});

test('thông báo giao việc đi đến chi tiết trong ứng dụng', () => {
  const id = '00000000-0000-4000-8000-000000000010';
  assert.equal(getNotificationTarget({ entityType: 'work', entityId: id }), `/work?workId=${id}`);
  assert.equal(getNotificationTarget({ entityType: 'work', entityId: 'https://example.com' }), '/');
});
