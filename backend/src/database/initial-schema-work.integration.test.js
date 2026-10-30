const test = require('node:test');
const assert = require('node:assert/strict');
const {
  randomUUID
} = require('node:crypto');
const path = require('node:path');
const mysql = require('mysql2/promise');
const knex = require('knex');
const bcrypt = require('bcryptjs');
const { UTC_CONNECTION_OPTIONS, afterCreate } = require('../config/mysql-connection');
const socketPath = process.env.E2E_MYSQL_SOCKET;
test('giao việc nhiều cấp: quyền, lịch, chuyển tiếp, rollback và yêu cầu đồng thời', {
  skip: socketPath ? false : 'Cần E2E_MYSQL_SOCKET trỏ MySQL thử nghiệm riêng'
}, async t => {
  const database = `E2E_work_${randomUUID().replaceAll('-', '')}`;
  const admin = await mysql.createConnection({
    socketPath,
    user: 'root'
  });
  await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const db = knex({
    client: 'mysql2',
    connection: {
      socketPath,
      user: 'root',
      database,
      ...UTC_CONNECTION_OPTIONS
    },
    pool: {
      min: 0,
      max: 3,
      afterCreate
    },
    migrations: {
      directory: path.join(__dirname, 'migrations')
    }
  });
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await db.destroy();
    await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
  });
  await db.migrate.latest();
  const dbModule = require.resolve('../config/database');
  require.cache[dbModule] = {
    id: dbModule,
    filename: dbModule,
    loaded: true,
    exports: db
  };
  process.env.JWT_SECRET = randomUUID() + randomUUID();
  process.env.CSRF_SECRET = randomUUID() + randomUUID();
  const app = require('../app/application');
  const d1 = randomUUID(),
    d2 = randomUUID();
  await db('departments').insert([{
    id: d1,
    code: 'E2E_D1',
    name: 'E2E Phòng 1'
  }, {
    id: d2,
    code: 'E2E_D2',
    name: 'E2E Phòng 2'
  }]);
  const ids = Object.fromEntries(['chief', 'head', 'member', 'other', 'outsider'].map(k => [k, randomUUID()]));
  const password = 'E2E_password_2026',
    hash = await bcrypt.hash(password, 4);
  await db('staff_members').insert(Object.entries(ids).map(([name, id]) => ({
    id,
    code: `E2E_${name}`,
    username: `E2E_${name}`,
    full_name: `E2E ${name}`,
    password_hash: hash,
    department_id: name === 'outsider' ? d2 : d1,
    is_active: 1,
    must_change_password: 0
  })));
  const role = randomUUID(),
    selfRole = randomUUID();
  await db('roles').insert([{
    id: role,
    name: 'e2e_dispatch',
    label: 'E2E Giao việc'
  }, {
    id: selfRole,
    name: 'e2e_self',
    label: 'E2E Tự tạo'
  }]);
  await db('role_permissions').insert(['work.assign', 'work.self_create', 'work.schedule_view'].map(action => ({
    role_id: role,
    action
  })).concat([{
    role_id: selfRole,
    action: 'work.self_create'
  }]));
  await db('staff_role_assignments').insert(['chief', 'head', 'member', 'other'].map(name => ({
    id: randomUUID(),
    staff_member_id: ids[name],
    role_id: ['chief', 'head'].includes(name) ? role : selfRole,
    scope_type: 'department',
    department_id: d1
  })));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (url, auth, method = 'GET', body) => {
    const response = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? {
          Cookie: auth.cookie,
          'X-CSRF-Token': auth.csrfToken
        } : {})
      },
      ...(body !== undefined ? {
        body: JSON.stringify(body)
      } : {})
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers
    };
  };
  const auth = {};
  for (const name of Object.keys(ids)) {
    const login = await request('/auth/login', null, 'POST', {
      username: `E2E_${name}`,
      password
    });
    assert.equal(login.status, 200);
    auth[name] = {
      ...login.body,
      cookie: login.headers.getSetCookie()[0].split(';')[0]
    };
  }
  const seg = (people, start = '08:00', end = '12:00', day = '2026-11-01') => ({
    content: 'E2E Kiểm tra',
    place: 'Khu A',
    startsAt: `${day}T${start}:00+07:00`,
    endsAt: `${day}T${end}:00+07:00`,
    assigneeIds: people.map(n => ids[n])
  });
  const create = (name, segments, source = 'assigned') => request('/work-assignments', auth[name], 'POST', {
    title: 'E2E Công việc',
    source,
    confirmPastStart: true,
    segments
  });
  const parts = async (workId, name = 'chief') => {
    const result = await request(`/work-assignments/${workId}`, auth[name]);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.items;
  };
  const action = (name, part, type, body = {}) => request(`/work-parts/${part.id}${type === 'edit' ? '' : '/' + type}`, auth[name], type === 'edit' ? 'PATCH' : 'POST', {
    version: part.version,
    ...body
  });
  let assigned, root, all, leaf, retained, part, editable;
  await t.test('người nhận chỉ trong phạm vi và không cao quyền hơn; backend chặn cả request trực tiếp', async () => {
    const higherDepartment = randomUUID();
    await db('departments').insert({ id: higherDepartment, code: 'E2E_SCOPE_CHILD', name: 'E2E Đơn vị con', parent_id: d1 });
    const targets = {};
    for (const kind of ['admin', 'system', 'tree', 'selected']) {
      const targetId = randomUUID(), targetRole = randomUUID(), grantId = randomUUID(); targets[kind] = targetId;
      await db('staff_members').insert({ id: targetId, code: `E2E_SCOPE_${kind}`, username: `E2E_SCOPE_${kind}`, full_name: `E2E Phạm vi ${kind}`, department_id: d1, password_hash: hash, is_active: 1, must_change_password: 0 });
      await db('roles').insert({ id: targetRole, name: `e2e_scope_${kind}`, label: `E2E Phạm vi ${kind}`, level: 0 });
      await db('role_permissions').insert({ role_id: targetRole, action: kind === 'admin' ? 'system.manage' : 'work.assign' });
      await db('staff_role_assignments').insert({ id: grantId, staff_member_id: targetId, role_id: targetRole, scope_type: kind === 'tree' ? 'department_tree' : kind === 'selected' ? 'specific_departments' : 'system', department_id: kind === 'tree' ? d1 : null });
      if (kind === 'selected') await db('staff_role_assignment_departments').insert([{ assignment_id: grantId, department_id: d1 }, { assignment_id: grantId, department_id: d2 }]);
    }
    const options = await request('/work-assignments/recipients?limit=100', auth.head);
    assert.equal(options.status, 200, JSON.stringify(options.body));
    const offered = options.body.items.map(item => item.id);
    assert.ok(offered.includes(ids.member)); assert.equal(offered.includes(ids.outsider), false);
    for (const targetId of Object.values(targets)) {
      assert.equal(offered.includes(targetId), false, 'không lộ người cao quyền trong danh sách');
      const segment = { ...seg(['member'], '08:00', '09:00', '2027-02-01'), assigneeIds: [targetId] };
      const forbidden = await create('head', [segment]);
      assert.equal(forbidden.status, 403); assert.equal(forbidden.body.code, 'WORK_RECIPIENT_FORBIDDEN');
      assert.equal((await request('/work-assignments/availability', auth.head, 'POST', { action: 'create', source: 'assigned', segments: [segment] })).status, 403);
      assert.equal((await request('/work-assignments/recipients?id=' + targetId, auth.head)).body.items.length, 0);
    }
    assert.equal((await request('/work-assignments?mode=given', auth.member)).status, 403);
    const viewGrant = randomUUID(), viewRole = randomUUID();
    await db('roles').insert({ id: viewRole, name: 'e2e_view_only_scope', label: 'E2E Chỉ xem' });
    await db('role_permissions').insert({ role_id: viewRole, action: 'work.schedule_view' });
    await db('staff_role_assignments').insert({ id: viewGrant, staff_member_id: ids.member, role_id: viewRole, scope_type: 'department', department_id: d1 });
    assert.equal((await request('/work-assignments?mode=given', auth.member)).status, 403);
    assert.equal((await request('/work-assignments/recipients?mode=given', auth.member)).status, 403);
    await db('staff_role_assignments').where({ id: viewGrant }).delete();
    const transferWork = await create('chief', [seg(['head'], '08:00', '09:00', '2027-02-02')]);
    assert.equal(transferWork.status, 201);
    const [transferPart] = await parts(transferWork.body.workId, 'head');
    assert.equal((await action('head', transferPart, 'transfer', { reason: 'E2E Không được giao ngược', segments: [{ ...seg(['member'], '08:00', '09:00', '2027-02-02'), assigneeIds: [targets.tree] }] })).status, 403);
    assert.equal((await parts(transferWork.body.workId, 'head'))[0].status, 'assigned');
    // Promotion blocks rescheduling, while cancellation of existing work remains available.
    const systemGrant = await db('staff_role_assignments').where({ staff_member_id: targets.system }).first();
    await db('staff_role_assignments').where({ id: systemGrant.id }).update({ is_active: 0 });
    assert.equal((await request('/work-assignments/recipients?id=' + targets.system, auth.head)).body.items.length, 1);
    const beforePromotion = await create('head', [{ ...seg(['member'], '08:00', '09:00', '2027-02-03'), assigneeIds: [targets.system] }]);
    assert.equal(beforePromotion.status, 201);
    const [promotedPart] = await parts(beforePromotion.body.workId, 'head');
    await db('staff_role_assignments').where({ id: systemGrant.id }).update({ is_active: 1 });
    assert.equal((await action('head', promotedPart, 'edit', { segments: [{ ...seg(['member'], '10:00', '11:00', '2027-02-03'), assigneeIds: [targets.system] }] })).status, 403);
    assert.equal((await action('head', promotedPart, 'cancel', { reason: 'E2E Hủy lịch cũ sau đổi quyền' })).status, 200);
    // Admin may delegate down to all of these scopes; equal assignment scopes remain peers.
    const administrator = require('../modules/work/work.policy');
    const adminPolicy = await administrator.loadPolicy(db, targets.admin);
    const adminOptions = await administrator.limitRecipients(db('staff_members as person'), adminPolicy).pluck('person.id');
    assert.ok(adminOptions.includes(ids.outsider)); assert.ok(adminOptions.includes(targets.tree));
  });
  await t.test('quyền giao việc: 401, 403 và 422 trước khi ghi', async () => {
  assert.equal((await request('/work-assignments')).status, 401);
  assert.equal((await request('/work-schedule', auth.member)).status, 403);
  assert.equal((await create('member', [seg(['other'])])).status, 403);
  assert.equal((await create('member', [seg(['other'])], 'self')).status, 403);
  assert.equal((await create('head', [seg(['outsider'])])).status, 403);
  assert.equal((await request('/work-assignments', auth.head, 'POST', {})).status, 422);
  assert.equal((await create('chief', [seg(['head']), seg(['head'], '11:00', '13:00')])).status, 422, 'trùng giờ trong cùng yêu cầu là dữ liệu sai');
  });
  await t.test('kiểm tra lịch bận chỉ đọc và che nội dung không được xem', async () => {
  assigned = await create('chief', [seg(['head'])]);
  assert.equal(assigned.status, 201, JSON.stringify(assigned.body));
  [root] = await parts(assigned.body.workId);
  assert.equal((await parts(assigned.body.workId, 'head')).length, 1);
  assert.equal((await request(`/work-assignments/${assigned.body.workId}`, auth.member)).status, 403);
  const preview = (name, segments, extra = {}) => request('/work-assignments/availability', auth[name], 'POST', { action: 'create', source: 'assigned', segments, ...extra });
  const beforePreview = Number((await db('work_assignments').count({ total: '*' }).first()).total);
  const busy = await preview('chief', [seg(['head'])]);
  assert.equal(busy.status, 200, JSON.stringify(busy.body));
  assert.equal(busy.body.conflicts.length, 1);
  assert.equal(busy.body.conflicts[0].canViewDetails, true);
  assert.equal(busy.body.conflicts[0].place, 'Khu A');
  assert.equal((await preview('chief', [seg(['head'], '12:00', '13:00')])).body.conflicts.length, 0, 'hai lịch liền giờ hợp lệ');
  assert.equal((await preview('chief', [seg(['head'])], { action: 'edit', excludeAssignmentId: root.id })).body.conflicts.length, 0);
  assert.equal((await preview('chief', [seg(['head'])], { action: 'transfer', excludeAssignmentId: root.id })).status, 403);
  assert.equal((await preview('chief', [seg(['head'])], { excludeAssignmentId: root.id })).status, 422);
  assert.equal((await preview('head', [seg(['head'])], { action: 'transfer', excludeAssignmentId: root.id })).body.conflicts.length, 0);
  assert.equal((await preview('member', [seg(['head'])], { source: 'self' })).status, 403);
  assert.equal((await preview('head', [seg(['outsider'])])).status, 403);
  assert.equal((await preview('chief', [], {})).status, 422);
  assert.equal((await request('/work-assignments/availability', null, 'POST', {})).status, 401);
  assert.equal(Number((await db('work_assignments').count({ total: '*' }).first()).total), beforePreview, 'preview không ghi dữ liệu');
  // Assign permission allows busy times but must not expose unrelated job contents.
  const assignOnlyRole = randomUUID();
  await db('roles').insert({ id: assignOnlyRole, name: 'e2e_assign_only', label: 'E2E Chỉ giao' });
  await db('role_permissions').insert({ role_id: assignOnlyRole, action: 'work.assign' });
  await db('staff_role_assignments').insert({ id: randomUUID(), staff_member_id: ids.other, role_id: assignOnlyRole, scope_type: 'department', department_id: d1 });
  const privateWork = await create('member', [{ ...seg(['member'], '08:00', '09:00', '2026-11-09'), content: 'E2E Nội dung riêng', place: 'E2E Nơi riêng' }], 'self');
  assert.equal(privateWork.status, 201);
  const redacted = await preview('other', [seg(['member'], '08:30', '09:30', '2026-11-09')]);
  assert.equal(redacted.status, 200);
  assert.equal(redacted.body.conflicts[0].canViewDetails, false);
  for (const field of ['title', 'place', 'workId', 'id']) assert.equal(Object.hasOwn(redacted.body.conflicts[0], field), false);
  const ownPreview = await preview('member', [seg(['member'], '08:30', '09:30', '2026-11-09')], { source: 'self' });
  assert.equal(ownPreview.body.conflicts[0].title, 'E2E Nội dung riêng');
  assert.equal((await request(`/work-assignments/${privateWork.body.workId}`, auth.other)).status, 403);
  });
  await t.test('chuyển tiếp, lọc theo người, hoàn thành và hủy nhánh', async () => {
  const changed = await action('head', root, 'transfer', {
    reason: 'E2E Chia lại lịch',
    segments: [seg(['member'], '13:00', '15:00'), seg(['other'], '15:00', '17:00'), seg(['head'], '17:00', '18:00')]
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  all = await parts(assigned.body.workId);
  assert.equal(all.length, 4);
  assert.equal(all.find(x => x.id === root.id).status, 'transferred');
  assert.equal((await parts(assigned.body.workId, 'member')).length, 1, 'thành viên không thấy nhánh người khác');
  const filterRange = '&from=2026-11-01T00%3A00%3A00%2B07%3A00&to=2026-11-02T00%3A00%3A00%2B07%3A00';
  const byMember = await request(`/work-assignments?mode=given&assigneeId=${ids.member}${filterRange}`, auth.chief);
  assert.equal(byMember.status, 200);
  assert.equal(byMember.body.items.length, 1);
  assert.ok(byMember.body.items.every(x => x.assigneeId === ids.member));
  assert.equal((await request(`/work-assignments?mode=given&assigneeId=${ids.outsider}${filterRange}`, auth.chief)).body.items.length, 0);
  assert.equal((await request('/work-assignments?mode=given&assigneeId=invalid', auth.chief)).status, 422);
  assert.equal((await request(`/work-assignments?mode=given&assigneeId=${ids.member}`, auth.member)).status, 403);
  assert.equal((await request('/work-assignments/recipients?mode=given', auth.member)).status, 403);
  assert.equal((await request('/work-assignments/recipients?mode=invalid', auth.chief)).status, 422);
  const givenPeople = await request('/work-assignments/recipients?mode=given', auth.chief);
  assert.equal(givenPeople.status, 200);
  assert.equal((await request('/work-assignments/recipients?mode=given&id=' + ids.member, auth.chief)).body.items[0].id, ids.member);
  assert.equal((await request('/work-assignments/recipients?mode=given&id=' + ids.outsider, auth.chief)).body.items.length, 0);
  assert.equal((await request('/work-assignments/recipients?mode=given&id=invalid', auth.chief)).status, 422);
  assert.equal(givenPeople.body.pagination.total, 3);
  assert.deepEqual(new Set(givenPeople.body.items.map(x => x.id)), new Set([ids.head, ids.member, ids.other]));
  const matchingPeople = await request('/work-assignments/recipients?mode=given&q=member&limit=1', auth.chief);
  assert.equal(matchingPeople.body.items.length, 1);
  assert.equal(matchingPeople.body.items[0].id, ids.member);
  assert.equal((await request('/work-assignments/recipients?mode=given&q=outsider', auth.chief)).body.items.length, 0);
  leaf = all.find(x => x.assigneeId === ids.member);
  assert.equal((await action('chief', leaf, 'complete')).status, 403);
  const completed = await action('member', leaf, 'complete', {
    note: 'E2E Xong'
  });
  assert.equal(completed.status, 200);
  const stale = await action('member', leaf, 'complete');
  assert.equal(stale.status, 409, 'phiên bản cũ bị chặn');
  assert.equal(stale.body.code, 'WORK_VERSION_CONFLICT');
  assert.equal((await create('head', [seg(['head'])])).status, 201, 'lịch cũ của người chuyển đã giải phóng');
  assert.equal((await create('member', [seg(['member'], '13:00', '14:00')], 'self')).status, 409, 'hoàn thành không giải phóng khung giờ');
  assert.equal((await create('member', [seg(['member'], '12:00', '13:00')], 'self')).status, 201, 'giờ liền nhau không trùng');
  all = await parts(assigned.body.workId);
  root = all.find(x => !x.parentId);
  assert.equal((await action('chief', root, 'edit', {
    segments: [seg(['head'])]
  })).status, 409, 'phần đã chuyển là xung đột trạng thái, không phải thiếu quyền');
  retained = all.find(x => x.assigneeId === ids.head && x.parentId);
  assert.equal((await action('head', retained, 'transfer', {
    reason: 'E2E Vòng',
    segments: [seg(['chief'], '19:00', '20:00')]
  })).status, 422);
  assert.equal((await action('head', retained, 'transfer', {
    reason: 'E2E Trùng',
    segments: [seg(['member'], '13:30', '14:30')]
  })).status, 409);
  assert.equal((await db('work_assignments').where({
    id: retained.id
  }).first()).status, 'assigned', 'chuyển thất bại giữ nguyên lịch cũ');
  const view = await request('/work-schedule?at=2026-11-01T13%3A30%3A00%2B07%3A00', auth.head);
  assert.equal(view.status, 200);
  assert.equal(view.body.items.some(s => s.id === ids.outsider), false);
  assert.equal(view.body.items.find(s => s.id === ids.member).status, 'completed');
  { // Lịch tuần: khoảng xem, phạm vi và quyền giao từng người.
    const range = '?from=2026-11-01T00%3A00%3A00%2B07%3A00&to=2026-11-02T00%3A00%3A00%2B07%3A00';
    const schedule = await request('/work-schedule' + range, auth.head);
    assert.equal(schedule.status, 200);
    assert.equal(schedule.body.items.some(person => person.id === ids.outsider), false);
    assert.equal(schedule.body.items.find(person => person.id === ids.member).canAssign, true);
    const options = await request('/work-schedule' + range + '&peopleOnly=1', auth.head);
    assert.equal(options.status, 200);
    assert.equal(options.body.items.some(person => person.id === ids.outsider), false);
    assert.ok(options.body.items.every(person => !Object.hasOwn(person, 'assignments')));
    assert.deepEqual((await request('/work-schedule' + range + '&assigneeId=' + ids.member, auth.head)).body.items.map(person => person.id), [ids.member]);
    assert.deepEqual((await request('/work-schedule' + range + '&peopleOnly=1&assigneeId=' + ids.outsider, auth.head)).body.items, []);
    assert.equal((await request('/work-schedule' + range + '&peopleOnly=bad', auth.head)).status, 422);
    assert.equal((await request('/work-schedule' + range + '&assigneeId=bad', auth.head)).status, 422);
    assert.equal((await request('/work-schedule' + range + '&peopleOnly=1', auth.member)).status, 403);
    assert.equal((await request('/work-schedule' + range + '&peopleOnly=1')).status, 401);

    assert.ok(schedule.body.items.find(person => person.id === ids.member).assignments.length > 0);
    for (const person of schedule.body.items) for (const part of person.assignments) {
      assert.ok(Date.parse(part.startsAt) < Date.parse('2026-11-02T00:00:00+07:00'));
      assert.ok(Date.parse(part.endsAt) > Date.parse('2026-11-01T00:00:00+07:00'));
    }
    assert.equal((await request('/work-schedule' + range, auth.member)).status, 403);
    assert.equal((await request('/work-schedule?from=2026-10-26T00%3A00%3A00%2B07%3A00&to=2026-11-02T00%3A00%3A00%2B07%3A00', auth.head)).status, 200);
    await db('role_permissions').insert({ role_id: selfRole, action: 'work.schedule_view' });
    try {
      const readOnly = await request('/work-schedule' + range, auth.member);
      assert.equal(readOnly.status, 200);
      assert.ok(readOnly.body.items.every(person => person.canAssign === false));
      assert.equal((await request('/work-schedule' + range + '&peopleOnly=1&assigneeId=' + ids.member, auth.member)).body.items[0].id, ids.member);
    } finally {
      await db('role_permissions').where({ role_id: selfRole, action: 'work.schedule_view' }).del();
    }

    assert.equal((await request('/work-schedule' + range)).status, 401);
    assert.equal((await request('/work-schedule?from=2026-11-01T00%3A00%3A00Z', auth.head)).status, 422);
    assert.equal((await request('/work-schedule?from=2026-11-01T00%3A00%3A00Z&to=2026-11-09T00%3A00%3A00Z', auth.head)).status, 422);
    assert.equal((await request('/work-schedule?from=2026-11-01T00%3A00%3A00Z&to=2026-11-01T00%3A00%3A00Z', auth.head)).status, 422);
  }

  assert.ok((await db('notifications').where({
    recipient_user_id: ids.chief
  })).length > 0);
  root = (await parts(assigned.body.workId)).find(x => !x.parentId);
  assert.equal((await action('chief', root, 'cancel', {
    reason: 'E2E Hủy nhánh'
  })).status, 200);
  all = await parts(assigned.body.workId);
  assert.equal(all.find(x => x.id === leaf.id).status, 'completed');
  assert.equal(all.find(x => x.id === retained.id).status, 'cancelled');
  });
  await t.test('sửa, đổi tên và ghi đồng thời', async () => {
  const concurrent = await Promise.all([create('head', [seg(['other'], '08:00', '12:00', '2026-11-02')]), create('chief', [seg(['other'], '09:00', '10:00', '2026-11-02')])]);
  assert.deepEqual(concurrent.map(x => x.status).sort(), [201, 409]);
  editable = await create('head', [seg(['other'], '08:00', '09:00', '2026-11-03')]);
  [part] = await parts(editable.body.workId, 'head');
  assert.equal((await action('head', part, 'edit', {
    segments: [seg(['other'], '09:00', '10:00', '2026-11-03')]
  })).status, 200);
  [part] = await parts(editable.body.workId, 'head');
  assert.equal((await request(`/work-assignments/${editable.body.workId}`, auth.head, 'PATCH', {
    version: part.version,
    title: 'E2E Đã sửa',
    description: 'E2E Nội dung'
  })).status, 200);
  [part] = await parts(editable.body.workId, 'head');
  const renamedSegment = { ...seg(['other'], '09:00', '10:00', '2026-11-03'), content: 'E2E Tên phần việc mới' };
  assert.equal((await action('head', part, 'edit', { segments: [renamedSegment] })).status, 200);
  const renamedList = await request('/work-assignments?mode=given&q=' + encodeURIComponent('Tên phần việc mới') + '&from=2026-11-03T00%3A00%3A00%2B07%3A00&to=2026-11-04T00%3A00%3A00%2B07%3A00', auth.head);
  assert.equal(renamedList.status, 200); assert.equal(renamedList.body.items.length, 1);
  assert.equal(renamedList.body.items[0].content, 'E2E Tên phần việc mới');
  assert.equal((await request('/work-assignments?mode=given&q=' + encodeURIComponent('Tên phần việc mới') + '&from=2026-11-03T00%3A00%3A00%2B07%3A00&to=2026-11-04T00%3A00%3A00%2B07%3A00', auth.member)).status, 403);
  });
  await t.test('ba cấp chuyển, snapshot đơn vị và mọi loại phạm vi', async () => {
  // A third level uses exactly the same assign permission, without role-name rules.
  await db('staff_role_assignments').where({
    staff_member_id: ids.other
  }).update({
    role_id: role
  });
  const third = await create('chief', [seg(['head'], '08:00', '09:00', '2026-11-06')]);
  let [thirdRoot] = await parts(third.body.workId);
  assert.equal(thirdRoot.startsAt, '2026-11-06T01:00:00Z', 'API trả ISO UTC');
  assert.equal((await action('head', thirdRoot, 'transfer', {
    reason: 'E2E Cấp 2',
    segments: [seg(['other'], '10:00', '11:00', '2026-11-06')]
  })).status, 200);
  let second = (await parts(third.body.workId)).find(x => x.assigneeId === ids.other);
  assert.equal((await action('other', second, 'transfer', {
    reason: 'E2E Cấp 3',
    segments: [seg(['member'], '12:00', '13:00', '2026-11-06')]
  })).status, 200);
  assert.equal((await parts(third.body.workId)).length, 3);
  assert.equal((await parts(third.body.workId, 'head')).length, 3);
  assert.equal((await parts(third.body.workId, 'member')).length, 1);
  const last = (await parts(third.body.workId, 'member'))[0];
  assert.equal((await action('member', last, 'complete')).status, 200);
  thirdRoot = (await parts(third.body.workId)).find(x => !x.parentId);
  assert.equal((await request(`/work-assignments/${third.body.workId}`, auth.chief, 'PATCH', { version: thirdRoot.version, title: 'E2E Không sửa việc đã xong' })).status, 409);
  assert.deepEqual(thirdRoot.progress, {
    completed: 1,
    total: 1
  });
  assert.equal((await action('chief', thirdRoot, 'cancel', {
    reason: 'E2E Đã xong'
  })).status, 409);
  // Snapshot visibility follows the original department after a transfer of staff.
  await db('staff_members').where({
    id: ids.member
  }).update({
    department_id: d2
  });
  assert.equal((await request('/work-schedule?at=2026-11-01T13%3A30%3A00%2B07%3A00', auth.head)).body.items.some(x => x.id === ids.member), true);
  assert.equal((await create('head', [seg(['member'], '10:00', '11:00', '2026-11-07')])).status, 403);
  await db('staff_members').where({
    id: ids.member
  }).update({
    department_id: d1
  });
  assert.equal((await request('/work-schedule?place=Khu%20khong%20co&at=2026-11-01T13%3A30%3A00%2B07%3A00', auth.head)).body.items.length, 0);
  assert.equal((await request('/work-schedule?departmentId=' + d2, auth.head)).status, 403);
  const deptOptions = await request('/work-schedule/departments', auth.head);
  assert.equal(deptOptions.status, 200);
  assert.deepEqual(deptOptions.body.items.map(x => x.id), [d1]);
  assert.equal((await request('/work-assignments/recipients', auth.member)).status, 403);
  assert.equal((await request('/work-assignments/recipients?q=outsider', auth.head)).body.items.length, 0);
  // The inherited tree, selected departments and system scopes all work for new rights.
  await db('departments').where({
    id: d2
  }).update({
    parent_id: d1
  });
  await db('staff_role_assignments').where({
    staff_member_id: ids.head
  }).update({
    scope_type: 'department_tree'
  });
  assert.equal((await create('head', [seg(['outsider'], '08:00', '09:00', '2026-11-08')])).status, 201);
  const headAssignment = await db('staff_role_assignments').where({
    staff_member_id: ids.head
  }).first();
  await db('staff_role_assignments').where({
    id: headAssignment.id
  }).update({
    scope_type: 'specific_departments',
    department_id: null
  });
  await db('staff_role_assignment_departments').insert({
    assignment_id: headAssignment.id,
    department_id: d2
  });
  assert.equal((await create('head', [seg(['outsider'], '09:00', '10:00', '2026-11-08')])).status, 201);
  assert.equal((await create('head', [seg(['member'], '10:00', '11:00', '2026-11-08')])).status, 403);
  await db('staff_role_assignments').where({
    id: headAssignment.id
  }).update({
    scope_type: 'system'
  });
  assert.equal((await create('head', [seg(['member'], '10:00', '11:00', '2026-11-08')])).status, 201);
  await db('role_permissions').where({
    role_id: role,
    action: 'work.assign'
  }).delete();
  [part] = await parts(editable.body.workId, 'head');
  assert.equal((await action('head', part, 'edit', {
    segments: [seg(['other'], '10:00', '11:00', '2026-11-03')]
  })).status, 403, 'thu hồi quyền có hiệu lực ngay');
  assert.equal((await create('member', [seg(['member'], '23:00', '01:00')], 'self')).status, 422);
  const night = seg(['member'], '23:00', '23:59', '2026-11-04');
  night.endsAt = '2026-11-05T01:00:00+07:00';
  assert.equal((await create('member', [night], 'self')).status, 201);
  assert.ok((await db('work_history').where({
    action: 'transferred'
  })).length);
  });
  await t.test('tạo đồng thời với chuyển hoặc sửa cùng người, cùng giờ: chỉ một yêu cầu thành công', async () => {
    // Restore the fixture's department scope after the scope-coverage subtest.
    await db('staff_role_assignments').where({ staff_member_id: ids.head }).update({ scope_type: 'department', department_id: d1 });
    // Restore assign permission removed above.
    await db('role_permissions').insert({ role_id: role, action: 'work.assign' });
    const { invalidatePermissionCache } = require('../services/permissions.service');
    invalidatePermissionCache();
    for (let round = 0; round < 4; round++) {
      const day = `2026-12-${String(round * 2 + 1).padStart(2, '0')}`;
      // Transfer: head passes his part to member while chief assigns member the same hour.
      const source = await create('chief', [seg(['head'], '08:00', '09:00', day)]);
      assert.equal(source.status, 201, JSON.stringify(source.body));
      const [sourcePart] = await parts(source.body.workId);
      const raced = await Promise.all([
        action('head', sourcePart, 'transfer', { reason: 'E2E Đua chuyển', segments: [seg(['member'], '10:00', '11:00', day)] }),
        create('chief', [seg(['member'], '10:30', '11:30', day)])
      ]);
      assert.deepEqual(raced.map(x => x.status < 300 ? 'ok' : x.status).sort(), [409, 'ok'], JSON.stringify(raced.map(x => x.body)));
      // Edit: head moves other's part onto a slot that chief assigns concurrently.
      const nextDay = `2026-12-${String(round * 2 + 2).padStart(2, '0')}`;
      const own = await create('head', [seg(['other'], '08:00', '09:00', nextDay)]);
      assert.equal(own.status, 201, JSON.stringify(own.body));
      const [ownPart] = await parts(own.body.workId, 'head');
      const edited = await Promise.all([
        action('head', ownPart, 'edit', { segments: [seg(['other'], '14:00', '15:00', nextDay)] }),
        create('chief', [seg(['other'], '14:30', '15:30', nextDay)])
      ]);
      assert.deepEqual(edited.map(x => x.status < 300 ? 'ok' : x.status).sort(), [409, 'ok'], JSON.stringify(edited.map(x => x.body)));
      const busy = await db('work_assignments').whereIn('assignee_id', [ids.member, ids.other]).whereIn('status', ['assigned', 'completed']).where('starts_at', '>=', `${day} 00:00:00`).where('ends_at', '<=', `2026-12-${String(round * 2 + 3).padStart(2, '0')} 00:00:00`).select('assignee_id', 'starts_at', 'ends_at');
      for (const a of busy) for (const b of busy) if (a !== b && a.assignee_id === b.assignee_id) assert.ok(!(a.starts_at < b.ends_at && b.starts_at < a.ends_at), 'không có lịch chồng nhau trong DB');
    }
    // The actor does not get a notification about their own action.
    const selfWork = await create('member', [seg(['member'], '20:00', '21:00', '2026-12-20')], 'self');
    assert.equal(selfWork.status, 201);
    assert.equal(Number((await db('notifications').where({ recipient_user_id: ids.member, entity_id: selfWork.body.workId }).count({ total: '*' }).first()).total), 0);
  });
  await t.test('giao nhóm và thành viên sửa/hủy việc tự tạo không cần seed dữ liệu mẫu', async () => {
    const grouped = await create('head', [seg(['member', 'other'], '08:00', '11:30', '2027-01-10')]);
    assert.equal(grouped.status, 201, JSON.stringify(grouped.body));
    const groupParts = await parts(grouped.body.workId, 'head');
    assert.equal(groupParts.length, 2);
    assert.deepEqual(new Set(groupParts.map(item => item.assigneeId)), new Set([ids.member, ids.other]));
    const own = await create('member', [seg(['member'], '13:30', '17:00', '2027-01-11')], 'self');
    assert.equal(own.status, 201, JSON.stringify(own.body));
    let [ownPart] = await parts(own.body.workId, 'member');
    assert.equal((await action('member', ownPart, 'edit', { segments: [{ ...seg(['member'], '14:00', '16:00', '2027-01-11'), content: 'E2E Tự sửa việc', place: 'Phòng họp' }] })).status, 200);
    [ownPart] = await parts(own.body.workId, 'member');
    assert.equal(ownPart.content, 'E2E Tự sửa việc');
    assert.equal(ownPart.place, 'Phòng họp');
    assert.equal((await action('member', ownPart, 'cancel', { reason: 'E2E Sắp xếp lại lịch cá nhân' })).status, 200);
    assert.equal((await parts(own.body.workId, 'member'))[0].status, 'cancelled');
  });
  await t.test('việc đã giao nhóm theo người, phân trang người và việc riêng, không lộ việc người khác giao', async () => {
    for (let i = 0; i < 7; i++) {
      assert.equal((await create('head', [seg(['member'], `${String(8 + i).padStart(2, '0')}:00`, `${String(8 + i).padStart(2, '0')}:30`, '2040-01-03')])).status, 201);
    }
    assert.equal((await create('head', [seg(['other'], '08:00', '09:00', '2040-01-03')])).status, 201);
    assert.equal((await create('chief', [seg(['member'], '17:00', '18:00', '2040-01-03')])).status, 201);
    const base = '/work-assignments?mode=given&from=2040-01-03T00%3A00%3A00%2B07%3A00&to=2040-01-04T00%3A00%3A00%2B07%3A00';
    const grouped = await request(base + '&groupBy=assignee', auth.head);
    assert.equal(grouped.status, 200, JSON.stringify(grouped.body));
    assert.equal(grouped.body.pagination.total, 2);
    assert.equal(grouped.body.pagination.workTotal, 8);
    const member = grouped.body.items.find(person => person.id === ids.member);
    assert.equal(member.total, 7);
    assert.equal(member.assigned, 7);
    assert.equal(member.assignments.length, 5);
    assert.ok(member.assignments.every(part => part.giverId === ids.head));
    const page1 = await request(base + '&groupBy=assignee&limit=1', auth.head);
    const page2 = await request(base + '&groupBy=assignee&limit=1&page=2', auth.head);
    assert.notEqual(page1.body.items[0].id, page2.body.items[0].id);
    const child = await request(base + '&assigneeId=' + ids.member + '&page=2&limit=5', auth.head);
    assert.equal(child.body.items.length, 2);
    assert.equal(child.body.pagination.total, 7);
    assert.ok(child.body.items.every(part => part.assigneeId === ids.member && part.giverId === ids.head));
    assert.equal((await request(base + '&groupBy=assignee&assigneeId=' + ids.member, auth.head)).body.items.length, 1);
    assert.equal((await request(base + '&groupBy=bad', auth.head)).status, 422);
    assert.equal((await request('/work-assignments?mode=mine&groupBy=assignee', auth.head)).status, 422);
    assert.equal((await request(base + '&groupBy=assignee', auth.member)).status, 403);
    assert.equal((await request(base + '&groupBy=assignee')).status, 401);
  });
  await t.test('tạo việc quá khứ cần xác nhận, lưu lịch sử và vẫn chặn trùng hoặc thiếu quyền', async () => {
    const body = { title: 'E2E Nhập việc quá khứ', source: 'assigned', segments: [seg(['member'], '08:00', '09:00', '2000-01-03')] };
    const before = Number((await db('work_items').count('* as n').first()).n);
    const denied = await request('/work-assignments', auth.head, 'POST', body);
    assert.equal(denied.status, 409);
    assert.equal(denied.body.code, 'WORK_PAST_CONFIRMATION_REQUIRED');
    assert.equal(Number((await db('work_items').count('* as n').first()).n), before);
    assert.equal((await request('/work-assignments', auth.head, 'POST', { ...body, confirmPastStart: 'true' })).status, 422);
    assert.equal((await request('/work-assignments', auth.member, 'POST', { ...body, confirmPastStart: true })).status, 403);
    const saved = await request('/work-assignments', auth.head, 'POST', { ...body, confirmPastStart: true });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const [part] = await parts(saved.body.workId, 'member');
    assert.equal(part.startsAt, '2000-01-03T01:00:00Z');
    const history = await db('work_history').where({ work_id: saved.body.workId, action: 'created' }).first('after_data');
    const snapshot = typeof history.after_data === 'string' ? JSON.parse(history.after_data) : history.after_data;
    assert.equal(snapshot.past_start_confirmed, true);

    assert.equal((await action('member', part, 'complete')).status, 200);
    assert.equal((await request('/work-assignments', auth.head, 'POST', { ...body, confirmPastStart: true })).status, 409, 'Xác nhận không bỏ qua kiểm tra trùng');
    const selfBody = { title: 'E2E Tự nhập quá khứ', source: 'self', segments: [seg(['member'], '10:00', '11:00', '2000-01-03')] };
    assert.equal((await request('/work-assignments', auth.member, 'POST', selfBody)).status, 409);
    assert.equal((await request('/work-assignments', auth.member, 'POST', { ...selfBody, confirmPastStart: true })).status, 201);
  });
  await t.test('rollback xóa bảng công việc và thành viên không được xem tình hình', async () => {
    assert.equal((await request('/work-schedule', auth.member)).status, 403);
    await db.migrate.rollback();
    assert.equal(await db.schema.hasTable('work_assignments'), false);
  });
});
