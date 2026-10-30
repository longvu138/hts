const db = require('../../config/database');
const {
  createUuid
} = require('../../utils/uuid');
const { fail } = require('../../utils/http-error');
const v = require('./work.validator');
const p = require('./work.policy');
const r = require('./work.repository');
const events = require('./work-events');
// READ COMMITTED: every statement sees the latest committed rows once our locks are granted,
// so a schedule committed while we waited for a staff lock is never invisible (no stale snapshot).
const TRANSACTION_OPTIONS = { isolationLevel: 'read committed' };
const transaction = handler => db.transaction(handler, TRANSACTION_OPTIONS);
const STATE_CONFLICT = 'WORK_STATE_CONFLICT';
const ensureVersion = (work, body) => {
  if (Number(work.version) !== v.version(body.version)) fail(409, 'Công việc vừa được cập nhật. Vui lòng tải lại trước khi thao tác', 'WORK_VERSION_CONFLICT');
};
// Lock order for every command: work item -> assignment rows -> staff rows (by id).
// The first read only resolves the immutable work_id; the row itself is read after the work lock.
const locked = async (trx, req, { withPolicy = true } = {}) => {
  const id = v.id(req.params.assignmentId);
  const ref = await trx('work_assignments').where({
    id
  }).select('work_id').first();
  if (!ref) fail(404, 'Không tìm thấy phần việc');
  const work = await trx('work_items').where({
    id: ref.work_id
  }).forUpdate().first();
  const row = await trx('work_assignments').where({
    id
  }).forUpdate().first();
  ensureVersion(work, req.body);
  return {
    row,
    work,
    policy: withPolicy ? await p.loadPolicy(trx, req.user.id) : null
  };
};
const bump = async (trx, work) => {
  await trx('work_items').where({
    id: work.id
  }).update({
    version: Number(work.version) + 1,
    updated_at: r.now()
  });
  return Number(work.version) + 1;
};
const create = async (req, options = {}) => {
  const body = req.body || {},
    title = v.text(body.title, 'Tên công việc', 200),
    description = v.text(body.description, 'Mô tả', 5000, false),
    rows = v.segments(body.segments);
  if (!['assigned', 'self'].includes(body.source)) fail(422, 'Nguồn công việc phải là giao việc hoặc tự tạo');
  const workId = options.id ? v.id(options.id) : createUuid();
  const result = await transaction(async trx => {
    const staff = await r.lockStaff(trx, [...rows.map(x => x.assigneeId), req.user.id]);
    const policy = await p.loadPolicy(trx, req.user.id);
    await p.authorizeEligibleRecipients(trx, policy, staff.filter(s => rows.some(x => x.assigneeId === s.id)), body.source);
    const pastStartConfirmed = v.requirePastStartConfirmation(rows, body.confirmPastStart);
    await r.checkConflicts(trx, rows);
    await trx('work_items').insert({
      id: workId,
      title,
      description,
      source: body.source,
      creator_id: req.user.id,
      version: 1,
      created_at: r.now(),
      updated_at: r.now()
    });
    const inserted = await r.insertRows(trx, workId, req.user.id, rows, staff);
    await r.historyMany(trx, req, inserted.map(row => ({ row, action: 'created', after: { ...row, past_start_confirmed: pastStartConfirmed } })));
    return {
      workId,
      version: 1,
      ids: inserted.map(x => x.id),
      pastStartConfirmed,
      after: inserted,
      notifications: await events.notify(trx, req, rows.map(x => x.assigneeId), workId, `Bạn được giao việc: ${title}`)
    };
  });
  return events.committed(req, 'work_created', result);
};
const transfer = async req => {
  const rows = v.segments(req.body.segments),
    reason = v.text(req.body.reason, 'Lý do chuyển', 1000);
  const result = await transaction(async trx => {
    const {
      row,
      work,
      policy
    } = await locked(trx, req);
    p.requireAction(policy, p.ASSIGN);
    if (row.assignee_id !== req.user.id) fail(403, 'Chỉ người đang nhận phần việc chưa hoàn thành mới được chuyển');
    if (row.status !== 'assigned') fail(409, 'Phần việc đã hoàn thành, đã chuyển hoặc đã hủy nên không thể chuyển', STATE_CONFLICT);
    const ancestors = await trx('work_assignment_paths as path').join('work_assignments as a', 'a.id', 'path.ancestor_id').where('path.descendant_id', row.id).select('a.giver_id', 'a.assignee_id');
    const forbidden = new Set(ancestors.flatMap(x => [x.giver_id, x.assignee_id]).filter(x => x !== req.user.id));
    if (rows.some(x => forbidden.has(x.assigneeId))) fail(422, 'Không được chuyển ngược cho người đã nằm trong chuỗi giao việc');
    if (!rows.some(x => x.assigneeId !== req.user.id)) fail(422, 'Vui lòng chọn ít nhất một người khác để chuyển việc');
    const staff = await r.lockStaff(trx, [...rows.map(x => x.assigneeId), row.assignee_id]);
    await p.authorizeEligibleRecipients(trx, policy, staff.filter(s => s.id !== req.user.id), 'assigned');
    await r.checkConflicts(trx, rows, [row.id]);
    const [{
      total
    }] = await trx('work_assignments').where({
      work_id: work.id
    }).count({
      total: '*'
    });
    if (Number(total) + rows.length > 1000 || ancestors.length >= 30) fail(422, 'Công việc đã đạt giới hạn 1000 phân công hoặc 30 cấp chuyển; vui lòng tạo công việc mới');
    await trx('work_assignments').where({
      id: row.id
    }).update({
      status: 'transferred',
      updated_at: r.now()
    });
    const inserted = await r.insertRows(trx, work.id, req.user.id, rows, staff, row.id);
    await r.historyMany(trx, req, [{
      row,
      action: 'transferred',
      before: row,
      after: {
        status: 'transferred',
        childIds: inserted.map(x => x.id)
      },
      reason
    }, ...inserted.map(child => ({ row: child, action: 'received', after: child, reason }))]);
    return {
      workId: work.id,
      version: await bump(trx, work),
      ids: [row.id, ...inserted.map(x => x.id)],
      reason,
      before: row,
      after: inserted,
      notifications: await events.notify(trx, req, [...rows.map(x => x.assigneeId), row.giver_id], work.id, `Công việc được chuyển và điều chỉnh lịch: ${work.title}`)
    };
  });
  return events.committed(req, 'work_transferred', result);
};
const edit = async req => {
  const rows = v.segments(req.body.segments);
  if (rows.length !== 1) fail(422, 'Mỗi lần sửa một phần việc; giữ nguyên người thực hiện');
  const result = await transaction(async trx => {
    const {
        row,
        work,
        policy
      } = await locked(trx, req),
      next = rows[0];
    if (row.giver_id !== req.user.id) fail(403, 'Chỉ được sửa lịch chưa hoàn thành do mình giao trực tiếp, giữ nguyên người thực hiện');
    if (row.status !== 'assigned') fail(409, 'Phần việc đã hoàn thành, đã chuyển hoặc đã hủy nên không thể sửa', STATE_CONFLICT);
    if (next.assigneeId !== row.assignee_id) fail(422, 'Chỉ được sửa lịch chưa hoàn thành do mình giao trực tiếp, giữ nguyên người thực hiện');
    const staff = await r.lockStaff(trx, [row.assignee_id]);
    await p.authorizeEligibleRecipients(trx, policy, staff, work.source === 'self' && row.assignee_id === req.user.id ? 'self' : 'assigned');
    await r.checkConflicts(trx, rows, [row.id]);
    const patch = {
      content: next.content,
      place: next.place,
      starts_at: next.startsAt,
      ends_at: next.endsAt,
      updated_at: r.now()
    };
    await trx('work_assignments').where({
      id: row.id
    }).update(patch);
    await r.history(trx, req, row, 'updated', row, {
      ...row,
      ...patch
    });
    return {
      workId: work.id,
      version: await bump(trx, work),
      ids: [row.id],
      before: row,
      after: patch,
      notifications: await events.notify(trx, req, [row.assignee_id], work.id, `Công việc đã thay đổi: ${next.content}`)
    };
  });
  return events.committed(req, 'work_updated', result);
};
const complete = async req => {
  const note = v.text(req.body.note, 'Ghi chú', 1000, false);
  const result = await transaction(async trx => {
    const {
      row,
      work
    } = await locked(trx, req, { withPolicy: false });
    if (row.assignee_id !== req.user.id) fail(403, 'Chỉ người đang thực hiện mới được hoàn thành phần việc');
    if (row.status !== 'assigned') fail(409, 'Phần việc đã hoàn thành, đã chuyển hoặc đã hủy', STATE_CONFLICT);
    await trx('work_assignments').where({
      id: row.id
    }).update({
      status: 'completed',
      note,
      updated_at: r.now()
    });
    await r.history(trx, req, row, 'completed', row, {
      status: 'completed',
      note
    });
    return {
      workId: work.id,
      version: await bump(trx, work),
      ids: [row.id],
      before: row,
      after: {
        status: 'completed',
        note
      },
      notifications: await events.notify(trx, req, [row.giver_id, work.creator_id], work.id, `Phần việc đã hoàn thành: ${work.title}`)
    };
  });
  return events.committed(req, 'work_completed', result);
};
const cancel = async req => {
  const reason = v.text(req.body.reason, 'Lý do hủy', 1000);
  const result = await transaction(async trx => {
    const {
      row,
      work,
      policy
    } = await locked(trx, req);
    if (row.giver_id !== req.user.id) fail(403, 'Chỉ người giao trực tiếp được hủy phần việc hoặc nhánh chưa hoàn thành');
    if (!['assigned', 'transferred'].includes(row.status)) fail(409, 'Nhánh không còn phần việc có thể hủy', STATE_CONFLICT);
    const branch = await trx('work_assignment_paths as path').join('work_assignments as a', 'a.id', 'path.descendant_id').where('path.ancestor_id', row.id).whereIn('a.status', ['assigned', 'transferred']).select('a.*');
    if (!branch.some(x => x.status === 'assigned')) fail(409, 'Nhánh không còn phần việc có thể hủy', STATE_CONFLICT);
    // Current ownership/scope is required for every unfinished leaf; no stale authority.
    const staff = await r.lockStaff(trx, branch.map(x => x.assignee_id), false);
    p.authorizeRecipients(policy, staff, work.source === 'self' && branch.every(x => x.assignee_id === req.user.id) ? 'self' : 'assigned');
    await trx('work_assignments').whereIn('id', branch.map(x => x.id)).update({
      status: 'cancelled',
      updated_at: r.now()
    });
    await r.historyMany(trx, req, branch.map(item => ({
      row: item,
      action: 'cancelled',
      before: item,
      after: {
        status: 'cancelled'
      },
      reason
    })));
    return {
      workId: work.id,
      version: await bump(trx, work),
      ids: branch.map(x => x.id),
      reason,
      before: branch,
      after: {
        status: 'cancelled'
      },
      notifications: await events.notify(trx, req, branch.map(x => x.assignee_id), work.id, `Công việc đã hủy: ${work.title}`)
    };
  });
  return events.committed(req, 'work_cancelled', result);
};
const updateInfo = async req => {
  const workId = v.id(req.params.workId),
    title = v.text(req.body.title, 'Tên công việc', 200),
    description = v.text(req.body.description, 'Mô tả', 5000, false);
  const result = await transaction(async trx => {
    const work = await trx('work_items').where({
      id: workId
    }).forUpdate().first();
    if (!work || work.creator_id !== req.user.id) fail(403, 'Chỉ người tạo được sửa thông tin chung');
    ensureVersion(work, req.body);
    const rows = await trx('work_assignments').where({
      work_id: work.id
    }).whereIn('status', ['assigned', 'transferred']);
    if (!rows.some(row => row.status === 'assigned')) fail(409, 'Công việc đã kết thúc, không thể sửa thông tin', STATE_CONFLICT);
    // Renaming does not change schedules, so deactivated assignees must not block it.
    const staff = await r.lockStaff(trx, rows.map(x => x.assignee_id), false);
    const policy = await p.loadPolicy(trx, req.user.id);
    p.requireAction(policy, work.source === 'self' ? p.SELF : p.ASSIGN);
    p.authorizeRecipients(policy, staff, work.source === 'self' && staff.every(s => s.id === req.user.id) ? 'self' : 'assigned');
    await trx('work_items').where({
      id: work.id
    }).update({
      title,
      description
    });
    await r.historyMany(trx, req, rows.map(row => ({
      row,
      action: 'info_updated',
      before: {
        title: work.title,
        description: work.description
      },
      after: {
        title,
        description
      }
    })));
    return {
      workId: work.id,
      version: await bump(trx, work),
      ids: rows.map(x => x.id),
      before: work,
      after: {
        title,
        description
      },
      notifications: await events.notify(trx, req, rows.map(x => x.assignee_id), work.id, `Thông tin công việc thay đổi: ${title}`)
    };
  });
  return events.committed(req, 'work_info_updated', result);
};
module.exports = {
  TRANSACTION_OPTIONS,
  create,
  transfer,
  edit,
  complete,
  cancel,
  updateInfo
};
