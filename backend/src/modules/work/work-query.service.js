const db = require('../../config/database');
const v = require('./work.validator');
const p = require('./work.policy');
const r = require('./work.repository');
const { fail } = require('../../utils/http-error');
const { buildPagination } = require('../../utils/pagination');
const { containsPattern } = require('../../utils/sql-like');
const pageResult = async (query, page, limit, select) => {
  const count = await query.clone().clearSelect().clearOrder().count({
    total: '*'
  }).first();
  const items = await select(query.clone().offset((page - 1) * limit).limit(limit));
  return {
    items,
    pagination: buildPagination({ page, limit }, count.total)
  };
};
// Keep the list and person selector restricted to branches this user has given.
const givenBranch = (query, userId) => query.whereExists(function () {
  this.select(1).from('work_assignment_paths as path').join('work_assignments as ancestor', 'ancestor.id', 'path.ancestor_id').whereColumn('path.descendant_id', 'a.id').where('ancestor.giver_id', userId);
});
const requirePeopleFilter = policy => {
  if (!policy.has(p.ASSIGN)) fail(403, 'Bạn chưa được cấp quyền xem việc đã giao theo người thực hiện');
};
// Page by recipient, then fetch only the first five assignments per recipient in one query.
// The caller passes the already-authorized/filtered query, so grouping never widens visibility.
const givenGroups = async (query, page, limit) => {
  const count = await query.clone().countDistinct({ total: 'a.assignee_id' }).count({ works: 'a.id' }).first();
  const people = await query.clone().select('a.assignee_id as id', 's.full_name as name')
    .count({ total: 'a.id' })
    .sum({ assigned: db.raw("CASE WHEN a.status = 'assigned' THEN 1 ELSE 0 END"), completed: db.raw("CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END") })
    .groupBy('a.assignee_id', 's.full_name').orderBy('s.full_name').orderBy('a.assignee_id')
    .offset((page - 1) * limit).limit(limit);
  const ranked = query.clone().whereIn('a.assignee_id', people.map(person => person.id)).select(r.columns)
    .select(db.raw('ROW_NUMBER() OVER (PARTITION BY a.assignee_id ORDER BY a.starts_at, a.id) AS person_order'));
  const assignments = people.length ? (await db.from(ranked.as('ranked')).select('*').where('person_order', '<=', 5).orderBy('starts_at').orderBy('id')).map(r.map) : [];
  return {
    items: people.map(person => ({
      id: person.id, name: person.name, total: Number(person.total), assigned: Number(person.assigned), completed: Number(person.completed),
      assignments: assignments.filter(part => part.assigneeId === person.id),
      assignmentPagination: buildPagination({ page: 1, limit: 5 }, person.total),
    })),
    pagination: { ...buildPagination({ page, limit }, count.total), workTotal: Number(count.works) },
  };
};
const list = async req => {
  const policy = await p.loadPolicy(db, req.user.id),
    {
      from,
      to
    } = v.range(req.query),
    {
      page,
      limit
    } = v.page(req.query);
  const mode = req.query.mode || 'mine';
  if (!['mine', 'given'].includes(mode)) fail(422, 'Chế độ xem không hợp lệ');
  if (mode === 'given') p.requireAction(policy, p.ASSIGN);
  if (req.query.groupBy !== undefined && (mode !== 'given' || req.query.groupBy !== 'assignee')) fail(422, 'Chỉ nhóm theo người thực hiện trong việc đã giao');
  const q = p.visible(r.baseQuery(db), policy).where('a.starts_at', '<', to).where('a.ends_at', '>', from);
  if (mode === 'mine') q.where('a.assignee_id', req.user.id); else givenBranch(q, req.user.id);
  if (req.query.assigneeId) {
    const assigneeId = v.id(req.query.assigneeId);
    requirePeopleFilter(policy);
    if (mode !== 'given') fail(422, 'Chỉ lọc người thực hiện trong việc đã giao');
    q.where('a.assignee_id', assigneeId);
  }
  if (req.query.q) {
    const search = containsPattern(v.text(req.query.q, 'Tìm kiếm', 200));
    q.where(function () { this.where('a.content', 'like', search).orWhere('w.title', 'like', search); });
  }
  if (req.query.status) {
    if (!['assigned', 'completed', 'transferred', 'cancelled'].includes(req.query.status)) fail(422, 'Trạng thái không hợp lệ');
    q.where('a.status', req.query.status);
  }
  if (req.query.groupBy === 'assignee') return givenGroups(q, page, limit);
  return pageResult(q, page, limit, async query => (await query.select(r.columns).orderBy('a.starts_at').orderBy('a.id')).map(r.map));
};
const detail = async req => {
  const workId = v.id(req.params.workId),
    policy = await p.loadPolicy(db, req.user.id);
  const {
    page,
    limit
  } = v.page(req.query);
  const q = p.visible(r.baseQuery(db), policy).where('w.id', workId);
  if (!(await q.clone().select('a.id').first())) fail(403, 'Bạn không có quyền xem công việc này hoặc công việc không tồn tại');
  const result = await pageResult(q, page, limit, async query => (await query.select(r.columns).orderByRaw('(SELECT COUNT(*) FROM work_assignment_paths AS ordering_path WHERE ordering_path.descendant_id = a.id) ASC').orderBy('a.created_at').orderBy('a.id')).map(r.map));
  const ids = result.items.map(x => x.id);
  const historyPage = v.page({ page: req.query.historyPage }).page;
  const historyQuery = db('work_history as h').join('staff_members as actor', 'actor.id', 'h.actor_id').whereIn('h.assignment_id', ids);
  const historyTotal = await historyQuery.clone().count({
    total: '*'
  }).first();
  const events = await historyQuery.clone().select('h.*', 'actor.full_name as actor_name').orderBy('h.created_at', 'desc').orderBy('h.id').offset((historyPage - 1) * 20).limit(20);
  result.historyPagination = {
    page: historyPage,
    limit: 20,
    total: Number(historyTotal.total)
  };
  const depths = await db('work_assignment_paths').whereIn('descendant_id', ids).select('descendant_id').count({
    depth: '*'
  }).groupBy('descendant_id');
  for (const item of result.items) item.depth = Number(depths.find(x => x.descendant_id === item.id)?.depth || 1) - 1;
  result.history = events.map(e => ({
    id: e.id,
    assignmentId: e.assignment_id,
    action: e.action,
    actorName: e.actor_name,
    reason: e.reason,
    before: e.before_data,
    after: e.after_data,
    createdAt: r.iso(e.created_at)
  }));
  // Ancestor status is derived from current leaves; completed history remains immutable.
  const transferred = result.items.filter(x => x.status === 'transferred');
  const counts = transferred.length ? await db('work_assignment_paths as path').join('work_assignments as leaf', 'leaf.id', 'path.descendant_id').whereIn('path.ancestor_id', transferred.map(x => x.id)).whereIn('leaf.status', ['assigned', 'completed']).select('path.ancestor_id', 'leaf.status').count({
    total: '*'
  }).groupBy('path.ancestor_id', 'leaf.status') : [];
  for (const item of transferred) {
    const own = counts.filter(x => x.ancestor_id === item.id);
    item.progress = {
      completed: Number(own.find(x => x.status === 'completed')?.total || 0),
      total: own.reduce((n, x) => n + Number(x.total), 0)
    };
  }
  return result;
};
const recipients = async req => {
  const policy = await p.loadPolicy(db, req.user.id);
  const mode = req.query.mode || 'assign';
  if (!['assign', 'given'].includes(mode)) fail(422, 'Chế độ chọn người không hợp lệ');
  if (mode === 'given') requirePeopleFilter(policy); else p.requireAction(policy, p.ASSIGN);
  const { page, limit } = v.page(req.query);
  const q = db('staff_members as person').leftJoin('departments as d', 'd.id', 'person.department_id');
  if (mode === 'given') {
    const visibleGiven = givenBranch(p.visible(r.baseQuery(db), policy), req.user.id).select('a.assignee_id');
    q.whereIn('person.id', visibleGiven);
  } else {
    q.where('person.is_active', 1);
    p.limitRecipients(q, policy);
  }
  if (req.query.id) q.where('person.id', v.id(req.query.id));
  if (req.query.q) q.where('person.full_name', 'like', containsPattern(v.text(req.query.q, 'Tìm người', 150)));
  return pageResult(q, page, limit, async query => (await query.select('person.id', 'person.full_name', 'd.name as department_name').orderBy('person.full_name').orderBy('person.id')).map(s => ({
    id: s.id,
    name: s.full_name,
    departmentName: s.department_name
  })));
};
const schedule = async req => {
  const policy = await p.loadPolicy(db, req.user.id);
  p.requireAction(policy, p.VIEW);
  const {
      page,
      limit
    } = v.page(req.query),
    at = v.instant(req.query.at || new Date().toISOString());
  if (req.query.peopleOnly !== undefined && req.query.peopleOnly !== '1') fail(422, 'Chế độ chọn người không hợp lệ');
  const ranged = req.query.from !== undefined || req.query.to !== undefined;
  if (ranged && (!req.query.from || !req.query.to)) fail(422, 'Vui lòng chọn đủ ngày bắt đầu và kết thúc');
  const range = ranged ? v.range(req.query) : null;
  if (range && Date.parse(range.to.replace(' ', 'T') + 'Z') - Date.parse(range.from.replace(' ', 'T') + 'Z') > 7 * 86400000) fail(422, 'Lịch theo người chỉ được xem tối đa 7 ngày mỗi lần');
  const during = (query, alias) => range
    ? query.where(`${alias}.starts_at`, '<', range.to).where(`${alias}.ends_at`, '>', range.from)
    : query.where(`${alias}.starts_at`, '<=', at).where(`${alias}.ends_at`, '>', at);
  const ids = policy.scope(p.VIEW);
  const q = db('staff_members as s').leftJoin('departments as d', 'd.id', 's.department_id').where('s.is_active', 1);
  if (ids !== null) q.where(function () {
    this.whereIn('s.department_id', ids).orWhereExists(function () {
      this.select(1).from('work_assignments as h').whereColumn('h.assignee_id', 's.id').whereIn('h.department_id', ids).whereIn('h.status', ['assigned', 'completed']);
      during(this, 'h');
    });
  });
  if (req.query.assigneeId) q.where('s.id', v.id(req.query.assigneeId));
  if (req.query.q) q.where('s.full_name', 'like', containsPattern(v.text(req.query.q, 'Tìm người', 150)));
  if (req.query.departmentId) {
    const departmentId = v.id(req.query.departmentId);
    if (!policy.allows(p.VIEW, departmentId)) fail(403, 'Bạn không có quyền xem đơn vị này');
    q.where('s.department_id', departmentId);
  }
  // Place is matched once in SQL (collation-aware, e.g. "khu a" matches "Khu Á"), never again in JS.
  const place = req.query.place ? v.text(req.query.place, 'Nơi làm việc', 200) : '';
  if (place) {
    q.whereExists(function () {
      this.select(1).from('work_assignments as loc').whereColumn('loc.assignee_id', 's.id').whereIn('loc.status', ['assigned', 'completed']).where('loc.place', 'like', containsPattern(place));
      during(this, 'loc');
      if (ids !== null) this.whereIn('loc.department_id', ids);
    });
  }
  return pageResult(q, page, limit, async query => {
    const staff = await query.select('s.id', 's.full_name', 'd.name as department_name').orderBy('s.full_name').orderBy('s.id');
    if (req.query.peopleOnly === '1') return staff.map(s => ({ id: s.id, name: s.full_name, departmentName: s.department_name }));
    const aq = r.baseQuery(db).whereIn('a.assignee_id', staff.map(s => s.id)).whereIn('a.status', ['assigned', 'completed']);
    during(aq, 'a');
    if (ids !== null) aq.whereIn('a.department_id', ids);
    if (place) aq.where('a.place', 'like', containsPattern(place));
    const matched = await aq.select(r.columns).orderBy('a.starts_at').orderBy('a.id').limit(2001);
    const assignments = matched.slice(0, 2000).map(r.map);
    const eligible = []; // resolved with the same policy as assignment writes
    if (policy.has(p.ASSIGN)) eligible.push(...await p.limitRecipients(db('staff_members as person').whereIn('person.id', staff.map(s => s.id)), policy).pluck('person.id'));
    const byPerson = new Map();
    for (const a of assignments) byPerson.set(a.assigneeId, [...(byPerson.get(a.assigneeId) || []), a]);
    const canAssign = new Set(eligible);
    return staff.map(s => {
      const own = byPerson.get(s.id) || [];
      return {
        id: s.id,
        name: s.full_name,
        departmentName: s.department_name,
        canAssign: canAssign.has(s.id),
        scheduleTruncated: matched.length > 2000,
        assignments: own,
        status: own.some(a => a.status === 'assigned') ? 'scheduled' : own.length ? 'completed' : 'free'
      };
    });
  });
};
const departments = async req => {
  const policy = await p.loadPolicy(db, req.user.id);
  p.requireAction(policy, p.VIEW);
  const {
    page,
    limit
  } = v.page(req.query);
  const q = db('departments').where({
    is_active: 1
  });
  if (req.query.q) q.where('name', 'like', containsPattern(v.text(req.query.q, 'Tìm đơn vị', 200)));
  const ids = policy.scope(p.VIEW);
  if (ids !== null) q.whereIn('id', ids);
  return pageResult(q, page, limit, async query => query.select('id', 'name').orderBy('name').orderBy('id'));
};
// Advisory only: writes always recheck conflicts inside their locking transaction.
const availability = async req => {
  const body = req.body || {};
  if (!['create', 'edit', 'transfer'].includes(body.action)) fail(422, 'Thao tác kiểm tra lịch không hợp lệ');
  if (!['self', 'assigned'].includes(body.source)) fail(422, 'Nguồn công việc không hợp lệ');
  if (body.action === 'transfer' && body.source !== 'assigned') fail(422, 'Chuyển việc phải dùng quyền giao việc');
  const segments = Array.isArray(body.segments) ? body.segments.map(segment => ({ ...segment, content: 'Kiểm tra lịch', place: 'Kiểm tra lịch' })) : body.segments;
  const rows = v.segments(segments);
  const policy = await p.loadPolicy(db, req.user.id);
  const ids = [...new Set(rows.map(row => row.assigneeId))];
  const staff = await db('staff_members').whereIn('id', ids).where('is_active', 1).select('id', 'department_id');
  if (staff.length !== ids.length) fail(422, 'Có người thực hiện không tồn tại hoặc đã ngừng hoạt động');
  await p.authorizeEligibleRecipients(db, policy, staff, body.source);
  let excluded;
  if (body.action !== 'create') {
    excluded = v.id(body.excludeAssignmentId);
    const part = await db('work_assignments as a').join('work_items as w', 'w.id', 'a.work_id').where('a.id', excluded).select('a.*', 'w.source').first();
    if (!part || part.status !== 'assigned' || (body.action === 'edit' ? part.giver_id !== req.user.id || ids.length !== 1 || ids[0] !== part.assignee_id : part.assignee_id !== req.user.id)) fail(403, 'Bạn không có quyền bỏ qua lịch này');
    if (body.action === 'edit' && body.source !== part.source) fail(422, 'Nguồn lịch đang sửa không khớp công việc');
  } else if (body.excludeAssignmentId) fail(422, 'Không được bỏ qua lịch khi tạo công việc mới');
  const query = r.baseQuery(db).whereIn('a.status', ['assigned', 'completed']).where(function () {
    for (const row of rows) this.orWhere(function () { this.where('a.assignee_id', row.assigneeId).where('a.starts_at', '<', row.endsAt).where('a.ends_at', '>', row.startsAt); });
  });
  if (excluded) query.whereNot('a.id', excluded);
  const matches = await query.select(r.columns).orderBy('a.starts_at').orderBy('a.id').limit(51);
  const shown = matches.slice(0, 50);
  const visible = await p.visible(r.baseQuery(db), policy).whereIn('a.id', shown.map(row => row.id)).select('a.id');
  const allowed = new Set(visible.map(row => row.id));
  return { conflicts: shown.map(row => ({
    assigneeId: row.assignee_id, assigneeName: row.assignee_name,
    startsAt: r.iso(row.starts_at), endsAt: r.iso(row.ends_at),
    canViewDetails: allowed.has(row.id),
    ...(allowed.has(row.id) ? { id: row.id, workId: row.work_id, title: row.content || row.title, place: row.place } : {})
  })), hasMore: matches.length > 50 };
};
module.exports = {
  availability,
  list,
  detail,
  recipients,
  schedule,
  departments
};
