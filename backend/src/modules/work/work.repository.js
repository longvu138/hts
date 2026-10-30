const { fail } = require('../../utils/http-error');
const { createUuid } = require('../../utils/uuid');
const { nowDb, toIsoUtc } = require('../../utils/datetime');
const now = nowDb;
const iso = toIsoUtc;
const map = r => ({
  id: r.id,
  workId: r.work_id,
  parentId: r.parent_id,
  giverId: r.giver_id,
  giverName: r.giver_name,
  assigneeId: r.assignee_id,
  assigneeName: r.assignee_name,
  departmentId: r.department_id,
  departmentName: r.department_name,
  title: r.title,
  description: r.description,
  source: r.source,
  version: r.version,
  content: r.content,
  place: r.place,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  status: r.status,
  note: r.note || '',
  createdAt: iso(r.created_at)
});
const baseQuery = db => db('work_assignments as a').join('work_items as w', 'w.id', 'a.work_id').join('staff_members as s', 's.id', 'a.assignee_id').join('staff_members as g', 'g.id', 'a.giver_id').leftJoin('departments as d', 'd.id', 'a.department_id');
const columns = ['a.*', 'w.title', 'w.description', 'w.source', 'w.version', 's.full_name as assignee_name', 'g.full_name as giver_name', 'd.name as department_name'];
// One locking read; rows are locked in primary-key order so concurrent writers cannot deadlock.
const lockStaff = async (trx, ids, requireActive = true) => {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return [];
  const rows = await trx('staff_members').whereIn('id', unique).orderBy('id').forUpdate();
  if (rows.length !== unique.length || requireActive && rows.some(row => !row.is_active)) fail(422, 'Người thực hiện không tồn tại hoặc đã ngừng hoạt động');
  return rows;
};
const formatVietnamTime = value => new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short'
}).format(new Date(iso(value)));
// Callers hold the assignees' staff locks, and work writes run in READ COMMITTED, so this
// plain read sees every committed schedule of those people.
const checkConflicts = async (trx, rows, excluded = []) => {
  if (!rows.length) return;
  const query = trx('work_assignments as a').join('staff_members as s', 's.id', 'a.assignee_id').whereIn('a.status', ['assigned', 'completed']).where(function () {
    for (const row of rows) this.orWhere(function () {
      this.where('a.assignee_id', row.assigneeId).where('a.starts_at', '<', row.endsAt).where('a.ends_at', '>', row.startsAt);
    });
  });
  if (excluded.length) query.whereNotIn('a.id', excluded);
  const matches = await query.select('a.assignee_id', 'a.starts_at', 'a.ends_at', 's.full_name').orderBy('a.starts_at').limit(200);
  if (!matches.length) return;
  for (const row of rows) {
    const match = matches.find(m => m.assignee_id === row.assigneeId && iso(m.starts_at) < iso(row.endsAt) && iso(m.ends_at) > iso(row.startsAt));
    if (match) fail(409, `${match.full_name} đã có lịch từ ${formatVietnamTime(match.starts_at)} đến ${formatVietnamTime(match.ends_at)}. Vui lòng chọn giờ khác`);
  }
  const first = matches[0];
  fail(409, `${first.full_name} đã có lịch từ ${formatVietnamTime(first.starts_at)} đến ${formatVietnamTime(first.ends_at)}. Vui lòng chọn giờ khác`);
};
const insertRows = async (trx, workId, giverId, rows, staff, parentId = null) => {
  const ancestors = parentId ? await trx('work_assignment_paths').where({
    descendant_id: parentId
  }).select('ancestor_id') : [];
  const departmentOf = new Map(staff.map(s => [s.id, s.department_id]));
  const timestamp = now();
  const result = rows.map(r => ({
    id: createUuid(),
    work_id: workId,
    parent_id: parentId,
    giver_id: giverId,
    assignee_id: r.assigneeId,
    department_id: departmentOf.get(r.assigneeId) ?? null,
    content: r.content,
    place: r.place,
    starts_at: r.startsAt,
    ends_at: r.endsAt,
    status: 'assigned',
    created_at: timestamp,
    updated_at: timestamp
  }));
  if (!result.length) return result;
  await trx('work_assignments').insert(result);
  await trx('work_assignment_paths').insert(result.flatMap(row => [{
    ancestor_id: row.id,
    descendant_id: row.id
  }, ...ancestors.map(a => ({
    ancestor_id: a.ancestor_id,
    descendant_id: row.id
  }))]));
  return result;
};
const snapshot = value => {
  if (Array.isArray(value)) return value.map(snapshot);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ['starts_at', 'ends_at', 'created_at', 'updated_at'].includes(key) ? iso(item) : item]));
};
// entries: [{ row, action, before, after, reason }] written in one insert.
const historyMany = async (trx, req, entries) => {
  if (!entries.length) return;
  const timestamp = now();
  await trx('work_history').insert(entries.map(({ row, action, before, after, reason }) => ({
    id: createUuid(),
    work_id: row.work_id,
    assignment_id: row.id,
    actor_id: req.user.id,
    action,
    before_data: before ? JSON.stringify(snapshot(before)) : null,
    after_data: after ? JSON.stringify(snapshot(after)) : null,
    reason: reason || null,
    created_at: timestamp
  })));
};
const history = (trx, req, row, action, before, after, reason) => historyMany(trx, req, [{ row, action, before, after, reason }]);
module.exports = {
  now,
  iso,
  map,
  baseQuery,
  columns,
  lockStaff,
  checkConflicts,
  insertRows,
  history,
  historyMany
};
