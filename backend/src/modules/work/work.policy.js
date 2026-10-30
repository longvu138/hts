const {
  getDescendantDepartmentIds
} = require('../../services/org.service');
const {
  fail
} = require('../../utils/http-error');
const ASSIGN = 'work.assign',
  SELF = 'work.self_create',
  VIEW = 'work.schedule_view';
// Always read fresh permissions using the same transaction; no process cache for writes.
const loadPolicy = async (db, userId) => {
  const rows = await db('staff_role_assignments as s').join('roles as r', 'r.id', 's.role_id').join('role_permissions as p', 'p.role_id', 'r.id').join('permission_actions as a', 'a.name', 'p.action').where({
    's.staff_member_id': userId,
    's.is_active': 1,
    'r.is_active': 1,
    'a.is_active': 1
  }).whereIn('a.name', [ASSIGN, SELF, VIEW, 'system.manage']).select('s.id', 's.scope_type', 's.department_id', 'a.name');
  const departments = await db('departments').where({
    is_active: 1
  }).select('id', 'parent_id');
  const selected = rows.length ? await db('staff_role_assignment_departments').whereIn('assignment_id', [...new Set(rows.map(r => r.id))]) : [];
  const admin = rows.some(r => r.name === 'system.manage');
  const scope = action => {
    if (admin || rows.some(r => r.name === action && r.scope_type === 'system')) return null;
    return [...new Set(rows.filter(r => r.name === action).flatMap(r => {
      if (r.scope_type === 'department') return departments.some(d => d.id === r.department_id) ? [r.department_id] : [];
      if (r.scope_type === 'department_tree') return departments.some(d => d.id === r.department_id) ? [r.department_id, ...getDescendantDepartmentIds(departments, r.department_id)] : [];
      return selected.filter(s => s.assignment_id === r.id && departments.some(d => d.id === s.department_id)).map(s => s.department_id);
    }))];
  };
  return {
    userId,
    isAdmin: admin,
    departments,
    has: action => admin || rows.some(r => r.name === action),
    scope,
    allows: (action, departmentId) => admin || rows.some(r => r.name === action) && (scope(action) === null || scope(action).includes(departmentId))
  };
};
const requireAction = (policy, action) => {
  if (!policy.has(action)) fail(403, 'Bạn chưa được cấp quyền thực hiện thao tác này');
};
const authorizeRecipients = (policy, staff, source) => {
  if (source === 'self') {
    requireAction(policy, SELF);
    if (staff.some(s => s.id !== policy.userId)) fail(403, 'Việc tự tạo chỉ được phân công cho bản thân');
  } else {
    requireAction(policy, ASSIGN);
    if (staff.some(s => !policy.allows(ASSIGN, s.department_id))) fail(403, 'Có người thực hiện nằm ngoài phạm vi giao việc của bạn');
  }
};
// A receiver must fit the giver's assignment scope and must not have a broader
// assignment authority. Display priority/role names never determine permission.
const limitRecipients = (query, policy, alias = 'person') => {
  const scope = policy.scope(ASSIGN);
  if (scope !== null) query.whereIn(`${alias}.department_id`, scope);
  if (policy.isAdmin) return query;
  const departments = policy.departments;
  const outside = scope === null ? [] : departments.filter(d => !scope.includes(d.id)).map(d => d.id);
  const broaderTrees = scope === null ? [] : departments.filter(d =>
    [d.id, ...getDescendantDepartmentIds(departments, d.id)].some(id => !scope.includes(id))).map(d => d.id);
  return query.whereNotExists(function () {
    this.select(1).from('staff_role_assignments as target_grant')
      .join('roles as target_role', 'target_role.id', 'target_grant.role_id')
      .whereColumn('target_grant.staff_member_id', `${alias}.id`)
      .where({ 'target_grant.is_active': 1, 'target_role.is_active': 1 })
      .where(function () {
        this.where('target_role.is_system', 1).orWhereExists(function () {
          this.select(1).from('role_permissions as target_permission')
            .join('permission_actions as target_action', 'target_action.name', 'target_permission.action')
            .whereColumn('target_permission.role_id', 'target_role.id')
            .where('target_action.is_active', 1)
            .where(function () {
              this.where('target_permission.action', 'system.manage');
              if (scope !== null) this.orWhere(function () {
                this.where('target_permission.action', ASSIGN).where(function () {
                  this.where('target_grant.scope_type', 'system')
                    .orWhere(function () { this.where('target_grant.scope_type', 'department').whereIn('target_grant.department_id', outside); })
                    .orWhere(function () { this.where('target_grant.scope_type', 'department_tree').whereIn('target_grant.department_id', broaderTrees); })
                    .orWhere(function () {
                      this.where('target_grant.scope_type', 'specific_departments').whereExists(function () {
                        this.select(1).from('staff_role_assignment_departments as target_selected')
                          .whereColumn('target_selected.assignment_id', 'target_grant.id')
                          .whereIn('target_selected.department_id', outside);
                      });
                    });
                });
              });
            });
        });
      });
  });
};
const authorizeEligibleRecipients = async (db, policy, staff, source) => {
  authorizeRecipients(policy, staff, source);
  if (source === 'self' || !staff.length) return;
  const allowed = await limitRecipients(db('staff_members as person').whereIn('person.id', staff.map(s => s.id)), policy).pluck('person.id');
  if (allowed.length !== new Set(staff.map(s => s.id)).size) fail(403, 'Không được giao việc cho người có quyền quản trị hoặc phạm vi giao việc cao hơn bạn', 'WORK_RECIPIENT_FORBIDDEN');
};
// Access to a branch follows participation in its ancestors, never all work of a recipient.
const visible = (query, policy, alias = 'a') => query.where(function () {
  this.whereExists(function () {
    this.select(1).from('work_assignment_paths as vp').join('work_assignments as va', 'va.id', 'vp.ancestor_id').whereColumn('vp.descendant_id', `${alias}.id`).where(function () {
      this.where('va.giver_id', policy.userId).orWhere('va.assignee_id', policy.userId);
    });
  });
  if (policy.has(VIEW)) {
    const ids = policy.scope(VIEW);
    if (ids === null) this.orWhereRaw('1=1');else this.orWhereIn(`${alias}.department_id`, ids);
  }
});
module.exports = {
  ASSIGN,
  SELF,
  VIEW,
  loadPolicy,
  requireAction,
  authorizeRecipients,
  authorizeEligibleRecipients,
  limitRecipients,
  visible
};
