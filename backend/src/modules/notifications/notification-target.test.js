const assert = require("node:assert/strict");
const test = require("node:test");
const { buildNotificationUrl } = require("./notification-target");

test("Web Push đưa thông báo lịch sử về trang chủ", () => {
  assert.equal(buildNotificationUrl({ entityType: "task", entityId: "task 1", type: "task.assigned" }), "/");
  assert.equal(buildNotificationUrl({ entityType: "task", entityId: "task-2", type: "personal_work.sla_overdue" }), "/");
  assert.equal(buildNotificationUrl({}), "/");
});

test('thông báo công việc mở đúng chi tiết, không điều hướng theo đường dẫn ngoài', () => {
  const id = '00000000-0000-4000-8000-000000000010';
  assert.equal(buildNotificationUrl({ entityType: 'work', entityId: id }), `/work?workId=${id}`);
  assert.equal(buildNotificationUrl({ entityType: 'work', entityId: 'https://example.com' }), '/');
});
