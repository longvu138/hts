const assert = require("node:assert/strict");
const test = require("node:test");
const createKnex = require("knex");
const migration = require("./migrations/202610240001_initial_schema");

const compileMigration = async (existingTable = null) => {
  const compiler = createKnex({ client: "mysql2" });
  const statements = [];
  const seeds = {};
  const trx = (table) => ({ insert: async (rows) => { seeds[table] = rows; } });
  const fake = {
    schema: {
      hasTable: async (name) => name === existingTable,
      createTable: async (name, callback) => statements.push(...compiler.schema.createTable(name, callback).toSQL().map((query) => query.sql)),
    },
    fn: compiler.fn,
    raw: (sql) => {
      statements.push(sql);
      const raw = compiler.raw(sql);
      raw.then = undefined; // Compile SQL without opening a database connection.
      return raw;
    },
    transaction: async (callback) => callback(trx),
  };
  try { await migration.up(fake); } finally { await compiler.destroy(); }
  return { statements, seeds };
};

test("database trắng chỉ tạo các bảng được giữ và seed quyền quản trị, không seed tài khoản", async () => {
  const { statements, seeds } = await compileMigration();
  const sql = statements.join("\n");
  const names = [...sql.matchAll(/create table\s+`?([a-z_]+)/gi)].map((match) => match[1]);
  assert.deepEqual(names, ["departments", "staff_members", "roles", "permission_actions", "role_permissions", "staff_role_assignments", "staff_role_assignment_departments", "auth_sessions", "notifications", "push_subscriptions", "administration_state"]);
  assert.doesNotMatch(sql, /\b(tasks|subtasks|task_assignees|work_types|duty_schedules|kpi_periods)\b/);
  assert.deepEqual(seeds.permission_actions.map((row) => row.name), ["department.view", "department.manage", "staff.view", "staff.manage", "system.manage"]);
  assert.doesNotMatch(sql, /\brole varchar/);
  assert.equal(seeds.staff_members, undefined);
  assert.equal(seeds.roles.name, "superadmin");
  assert.equal(seeds.role_permissions.action, "system.manage");
  assert.deepEqual(seeds.administration_state, { id: 1, bootstrap_completed: false });
});

test("migration từ chối database đã có bảng ứng dụng", async () => {
  await assert.rejects(compileMigration("staff_members"), /database trắng/);
});
