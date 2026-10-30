const actions = [{
  name: 'work.assign',
  label: 'Giao việc',
  group_name: 'work',
  sort_order: 1
}, {
  name: 'work.self_create',
  label: 'Tự tạo việc',
  group_name: 'work',
  sort_order: 2
}, {
  name: 'work.schedule_view',
  label: 'Xem tình hình',
  group_name: 'work',
  sort_order: 3
}];
exports.up = async knex => {
  await knex.schema.createTable('work_items', t => {
    t.engine('InnoDB');
    t.charset('utf8mb4');
    t.collate('utf8mb4_unicode_ci');
    t.specificType('id', 'char(36)').primary();
    t.string('title', 200).notNullable();
    t.text('description').nullable();
    t.specificType('creator_id', 'char(36)').notNullable().references('id').inTable('staff_members');
    t.string('source', 20).notNullable();
    t.integer('version').notNullable().defaultTo(1);
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
  });
  await knex.schema.createTable('work_assignments', t => {
    t.engine('InnoDB');
    t.charset('utf8mb4');
    t.collate('utf8mb4_unicode_ci');
    t.specificType('id', 'char(36)').primary();
    t.specificType('work_id', 'char(36)').notNullable().references('id').inTable('work_items');
    t.specificType('parent_id', 'char(36)').nullable().references('id').inTable('work_assignments');
    t.specificType('giver_id', 'char(36)').notNullable().references('id').inTable('staff_members');
    t.specificType('assignee_id', 'char(36)').notNullable().references('id').inTable('staff_members');
    t.specificType('department_id', 'char(36)').nullable().references('id').inTable('departments');
    t.string('content', 500).notNullable();
    t.string('place', 200).notNullable();
    // DATETIME contains UTC literals; no dependency on the database session timezone.
    t.dateTime('starts_at').notNullable();
    t.dateTime('ends_at').notNullable();
    t.string('status', 20).notNullable().defaultTo('assigned');
    t.text('note').nullable();
    t.dateTime('created_at').notNullable();
    t.dateTime('updated_at').notNullable();
    t.index(['assignee_id', 'status', 'starts_at', 'ends_at'], 'idx_work_busy');
    // "Việc của tôi" filters by assignee and time range without a status filter.
    t.index(['assignee_id', 'starts_at'], 'idx_work_assignee_starts');
    t.index(['department_id', 'starts_at']);
    t.index(['work_id', 'created_at']);
    t.index('parent_id');
  });
  await knex.schema.createTable('work_assignment_paths', t => {
    t.engine('InnoDB');
    t.charset('utf8mb4');
    t.collate('utf8mb4_unicode_ci');
    t.specificType('ancestor_id', 'char(36)').notNullable().references('id').inTable('work_assignments');
    t.specificType('descendant_id', 'char(36)').notNullable().references('id').inTable('work_assignments');
    t.primary(['ancestor_id', 'descendant_id']);
    t.index('descendant_id');
  });
  await knex.schema.createTable('work_history', t => {
    t.engine('InnoDB');
    t.charset('utf8mb4');
    t.collate('utf8mb4_unicode_ci');
    t.specificType('id', 'char(36)').primary();
    t.specificType('work_id', 'char(36)').notNullable().references('id').inTable('work_items');
    t.specificType('assignment_id', 'char(36)').notNullable().references('id').inTable('work_assignments');
    t.specificType('actor_id', 'char(36)').notNullable().references('id').inTable('staff_members');
    t.string('action', 30).notNullable();
    t.text('reason').nullable();
    t.json('before_data').nullable();
    t.json('after_data').nullable();
    t.dateTime('created_at').notNullable();
    t.index(['assignment_id', 'created_at']);
  });
  await knex('permission_actions').insert(actions);
};
exports.down = async knex => {
  await knex('role_permissions').whereIn('action', actions.map(a => a.name)).delete();
  await knex('permission_actions').whereIn('name', actions.map(a => a.name)).delete();
  for (const table of ['work_history', 'work_assignment_paths', 'work_assignments', 'work_items']) await knex.schema.dropTableIfExists(table);
};
