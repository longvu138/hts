const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('./work.policy');

// Minimal chainable fake: each table resolves to fixed rows, ignoring filters except whereIn on assignment ids.
const fakeDb = fixtures => table => {
  const name = table.split(' ')[0];
  const builder = {
    join: () => builder,
    where: () => builder,
    whereIn: () => builder,
    select: () => builder,
    then: (resolve, reject) => Promise.resolve(fixtures[name] || []).then(resolve, reject)
  };
  return builder;
};
const departments = [{ id: 'd1', parent_id: null }, { id: 'd2', parent_id: 'd1' }, { id: 'd3', parent_id: null }];
const load = rows => p.loadPolicy(fakeDb({ staff_role_assignments: rows, departments, staff_role_assignment_departments: [{ assignment_id: 's3', department_id: 'd3' }] }), 'u1');

test('phạm vi giao việc theo đơn vị, cây đơn vị và danh sách đơn vị', async () => {
  const dept = await load([{ id: 's1', scope_type: 'department', department_id: 'd1', name: p.ASSIGN }]);
  assert.deepEqual(dept.scope(p.ASSIGN), ['d1']);
  assert.equal(dept.allows(p.ASSIGN, 'd2'), false);
  const tree = await load([{ id: 's2', scope_type: 'department_tree', department_id: 'd1', name: p.ASSIGN }]);
  assert.deepEqual(tree.scope(p.ASSIGN).sort(), ['d1', 'd2']);
  const specific = await load([{ id: 's3', scope_type: 'specific_departments', department_id: null, name: p.ASSIGN }]);
  assert.deepEqual(specific.scope(p.ASSIGN), ['d3']);
  assert.equal(specific.has(p.VIEW), false);
});

test('phạm vi hệ thống và system.manage được giao toàn bộ', async () => {
  const system = await load([{ id: 's4', scope_type: 'system', department_id: null, name: p.ASSIGN }]);
  assert.equal(system.scope(p.ASSIGN), null);
  assert.equal(system.allows(p.ASSIGN, 'bất kỳ'), true);
  const admin = await load([{ id: 's5', scope_type: 'department', department_id: 'd1', name: 'system.manage' }]);
  assert.equal(admin.has(p.VIEW), true);
  assert.equal(admin.scope(p.VIEW), null);
});

test('tự tạo chỉ cho bản thân; giao việc ngoài phạm vi bị 403', async () => {
  const policy = await load([{ id: 's1', scope_type: 'department', department_id: 'd1', name: p.ASSIGN }, { id: 's1', scope_type: 'department', department_id: 'd1', name: p.SELF }]);
  assert.doesNotThrow(() => p.authorizeRecipients(policy, [{ id: 'u1', department_id: 'd3' }], 'self'));
  assert.throws(() => p.authorizeRecipients(policy, [{ id: 'u2', department_id: 'd1' }], 'self'), e => e.statusCode === 403);
  assert.doesNotThrow(() => p.authorizeRecipients(policy, [{ id: 'u2', department_id: 'd1' }], 'assigned'));
  assert.throws(() => p.authorizeRecipients(policy, [{ id: 'u3', department_id: 'd2' }], 'assigned'), e => e.statusCode === 403);
  const none = await load([]);
  assert.throws(() => p.requireAction(none, p.ASSIGN), e => e.statusCode === 403);
});
