const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mysql = require("mysql2/promise");
const createKnex = require("knex");
const { UTC_CONNECTION_OPTIONS, afterCreate } = require("../config/mysql-connection");

const socketPath = process.env.E2E_MYSQL_SOCKET;

test("database trắng migrate/rollback được và đăng nhập, phân quyền, thông báo hoạt động", {
  skip: socketPath ? false : "Cần E2E_MYSQL_SOCKET trỏ tới MySQL thử nghiệm riêng, không dùng database thật.",
}, async (t) => {
  const databaseName = `E2E_schema_${randomUUID().replaceAll("-", "")}`;
  const admin = await mysql.createConnection({ socketPath, user: "root" });
  let db;
  let server;
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    if (db) await db.destroy();
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.end();
  });
  await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  db = createKnex({
    client: "mysql2",
    connection: { socketPath, user: "root", database: databaseName, ...UTC_CONNECTION_OPTIONS },
    pool: { min: 0, max: 3, afterCreate },
    migrations: { directory: path.join(__dirname, "migrations") },
  });
  const [, applied] = await db.migrate.latest();
  assert.deepEqual(applied, ["202610240001_initial_schema.js", "202610240002_work_assignments.js"]);
  const [[timezone]] = await db.raw("SELECT @@session.time_zone AS tz");
  assert.equal(timezone.tz, "+00:00", "mọi kết nối chạy UTC");
  assert.deepEqual((await db.migrate.latest())[1], []);
  assert.equal((await db("permission_actions")).length, 8);
  assert.equal(await db.schema.hasColumn("staff_members", "role"), false);
  assert.equal((await db("staff_members")).length, 0);
  const [tables] = await db.raw("SHOW TABLES");
  assert.equal(tables.length, 17); // App tables, administration state, and Knex metadata.
  const [columns] = await db.raw("SHOW COLUMNS FROM auth_sessions LIKE 'expires_at'");
  assert.equal(columns[0].Type, "datetime");
  assert.doesNotMatch(columns[0].Extra, /on update/i);
  await db.migrate.rollback();
  const [afterRollback] = await db.raw("SHOW TABLES");
  assert.equal(afterRollback.length, 2);
  await db.migrate.latest();

  // Point only this test process at the isolated database before loading the app.
  const dbModule = require.resolve("../config/database");
  require.cache[dbModule] = { id: dbModule, filename: dbModule, loaded: true, exports: db };
  process.env.JWT_SECRET = randomUUID() + randomUUID();
  process.env.CSRF_SECRET = randomUUID() + randomUUID();
  const bootstrapToken = randomUUID() + randomUUID();
  process.env.BOOTSTRAP_TOKEN = bootstrapToken;
  // This flow sends many sensitive requests from one IP; rate limits are covered elsewhere.
  process.env.AUTH_SENSITIVE_RATE_LIMIT_MAX = "1000";
  const app = require("../app/application");
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, { method = "GET", body, auth, headers = {} } = {}) => {
    const response = await fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json", ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrfToken } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { response, body: await response.json() };
  };
  const password = "E2E_password_2026";
  const bootstrapHeaders = { "X-Bootstrap-Token": bootstrapToken };
  // Public bootstrap requires the one-time server token; without the env variable it is disabled.
  const noToken = await request("/auth/bootstrap-admin", { method: "POST", body: { username: "E2E_USER_notoken", password } });
  assert.equal(noToken.response.status, 403);
  assert.equal(noToken.body.code, "BOOTSTRAP_TOKEN_INVALID");
  assert.equal((await request("/auth/bootstrap-admin", { method: "POST", headers: { "X-Bootstrap-Token": "sai-ma" }, body: { username: "E2E_USER_notoken", password } })).response.status, 403);
  delete process.env.BOOTSTRAP_TOKEN;
  const disabled = await request("/auth/bootstrap-admin", { method: "POST", headers: bootstrapHeaders, body: { username: "E2E_USER_notoken", password } });
  assert.equal(disabled.body.code, "BOOTSTRAP_DISABLED");
  process.env.BOOTSTRAP_TOKEN = bootstrapToken;
  // Request ids are echoed only when they are simple; anything else is replaced.
  const unsafeId = await fetch(base + "/health", { headers: { "X-Request-Id": "abc\ninjected" } }).catch(() => null);
  if (unsafeId) assert.notEqual(unsafeId.headers.get("x-request-id"), "abc\ninjected");
  assert.equal((await fetch(base + "/health", { headers: { "X-Request-Id": "E2E-req-1" } })).headers.get("x-request-id"), "E2E-req-1");
  assert.notEqual((await fetch(base + "/health", { headers: { "X-Request-Id": "x".repeat(65) } })).headers.get("x-request-id"), "x".repeat(65));
  // Roll back both user and role assignment if setup cannot produce a working admin.
  const superRole = await db("roles").where({ name: "superadmin" }).first();
  await db("role_permissions").where({ role_id: superRole.id }).delete();
  const invalidSetup = await request("/auth/bootstrap-admin", { method: "POST", headers: bootstrapHeaders, body: { username: "E2E_USER_rollback", password } });
  assert.equal(invalidSetup.response.status, 409);
  assert.equal(Number((await db("staff_members").count({ total: "*" }).first()).total), 0);
  assert.equal(Number((await db("staff_role_assignments").count({ total: "*" }).first()).total), 0);
  assert.equal(Number((await db("administration_state").first()).bootstrap_completed), 0);
  await db("role_permissions").insert({ role_id: superRole.id, action: "system.manage" });
  const setupResults = await Promise.all(["E2E_USER_admin", "E2E_USER_other"].map((username) => request("/auth/bootstrap-admin", { method: "POST", headers: bootstrapHeaders, body: { username, password, fullName: "E2E Quản trị" } })));
  assert.deepEqual(setupResults.map((result) => result.response.status).sort(), [201, 409]);
  const bootstrap = setupResults.find((result) => result.response.status === 201);
  assert.ok(bootstrap.body.user.permissions.includes("system.manage"));
  assert.equal(Number((await db("staff_members").count({ total: "*" }).first()).total), 1);
  assert.equal(Number((await db("departments").count({ total: "*" }).first()).total), 0);

  assert.equal(Number((await db("administration_state").first()).bootstrap_completed), 1);
  const secondBootstrap = await request("/auth/bootstrap-admin", { method: "POST", headers: bootstrapHeaders, body: { username: "E2E_USER_duplicate", password } });
  assert.equal(secondBootstrap.response.status, 409);
  const login = async (username, accountPassword = password) => {
    const result = await request("/auth/login", { method: "POST", body: { username, password: accountPassword } });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    return { ...result.body, cookie: result.response.headers.getSetCookie()[0].split(";")[0] };
  };
  let auth = await login(bootstrap.body.user.username);
  const me = await request("/auth/me", { auth });
  assert.equal(me.response.status, 200);
  assert.equal("role" in (me.body.user || me.body), false);
  assert.equal((await request("/roles/actions", { auth })).body.length, 8);
  assert.equal((await request("/roles/actions")).response.status, 401);
  const department = await request("/departments", { method: "POST", auth, body: { code: "E2E_DEPT_1", name: "E2E Phòng kiểm thử" } });
  assert.equal(department.response.status, 201, JSON.stringify(department.body));
  assert.equal((await request("/departments", { auth })).body.length, 1);
  const staff = await request("/staff-members", { method: "POST", auth, body: { code: "E2E_USER_staff", username: "E2E_USER_staff", password, fullName: "E2E Cán bộ", departmentId: department.body.id } });
  assert.equal(staff.response.status, 201, JSON.stringify(staff.body));
  await db("staff_members").where({ username: "E2E_USER_staff" }).update({ must_change_password: 0 });
  const staffAuth = await login("E2E_USER_staff");
  assert.equal((await request("/roles/actions", { auth: staffAuth })).response.status, 403);
  assert.equal((await request("/staff-members", { auth })).body.pagination.total, 2);

  // H1/H2: a department-scoped staff manager cannot touch more privileged accounts or escalate.
  const createRoleWith = async (name, actions) => {
    const created = await request("/roles", { method: "POST", auth, body: { name, label: `E2E ${name}` } });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal((await request(`/roles/${created.body.id}/permissions`, { method: "PUT", auth, body: { actions } })).response.status, 200);
    return created.body;
  };
  const managerRole = await createRoleWith("e2e_role_staff_manager", ["staff.view", "staff.manage"]);
  const departmentRole = await createRoleWith("e2e_role_department_editor", ["department.view", "department.manage"]);
  const superRoleId = (await db("roles").where({ name: "superadmin" }).first()).id;
  const createUser = async (code, roleAssignments = []) => {
    const created = await request("/staff-members", { method: "POST", auth, body: { code, username: code, password, fullName: code, departmentId: department.body.id, roleAssignments } });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    await db("staff_members").where({ id: created.body.id }).update({ must_change_password: 0 });
    return created.body;
  };
  const manager = await createUser("E2E_USER_manager", [{ roleId: managerRole.id, scopeType: "department", departmentId: department.body.id }]);
  const member = await createUser("E2E_USER_member");
  const sysops = await createUser("E2E_USER_sysops", [{ roleId: superRoleId, scopeType: "system" }]);
  const managerAuth = await login("E2E_USER_manager");
  const optionsMemberAuth = await login('E2E_USER_member');
  assert.equal((await request('/staff-members/assignment-options', { auth: optionsMemberAuth })).response.status, 403);
  const assignmentOptions = await request('/staff-members/assignment-options', { auth: managerAuth });
  assert.equal(assignmentOptions.response.status, 200);
  assert.ok(assignmentOptions.body.roles.some(role => role.id === managerRole.id));
  assert.equal(assignmentOptions.body.roles.some(role => role.isSystem), false);
  assert.equal(assignmentOptions.body.scopes.some(scope => ['system', 'department_tree'].includes(scope.value)), false);
  assert.ok(assignmentOptions.body.departments.some(item => item.id === department.body.id));
  assert.equal((await request('/staff-members/assignment-options?q=bad&q=twice', { auth: managerAuth })).response.status, 422);
  assert.equal((await request('/staff-members/assignment-options')).response.status, 401);
  const adminOptions = await request('/staff-members/assignment-options', { auth });
  assert.ok(adminOptions.body.scopes.some(scope => scope.value === 'system'));
  const resetBody = { password: "E2E_reset_pass_2026", confirmPassword: "E2E_reset_pass_2026" };
  assert.equal((await request(`/auth/admin/reset-password/${sysops.id}`, { method: "POST", auth: managerAuth, body: resetBody })).response.status, 403);
  assert.equal((await request(`/staff-members/${sysops.id}`, { method: "PATCH", auth: managerAuth, body: { isActive: false } })).response.status, 403);
  assert.equal((await request(`/staff-members/${sysops.id}`, { method: "PATCH", auth: managerAuth, body: { username: "E2E_USER_renamed" } })).response.status, 403);
  assert.equal((await request(`/auth/admin/users/${sysops.id}/sessions`, { auth: managerAuth })).response.status, 403);
  assert.equal((await request(`/auth/admin/users/${sysops.id}/sessions/revoke-all`, { method: "POST", auth: managerAuth })).response.status, 403);
  assert.equal((await request(`/staff-members/${sysops.id}`, { method: "PATCH", auth: managerAuth, body: { phone: "0900000001" } })).response.status, 200, "sửa thông tin thường vẫn được phép");
  assert.equal((await request(`/auth/admin/reset-password/${member.id}`, { method: "POST", auth: managerAuth, body: resetBody })).response.status, 200);
  const grant = (target, body) => request(`/staff-members/${target}/role-assignments`, { method: "POST", auth: managerAuth, body });
  assert.equal((await grant(manager.id, { roleId: managerRole.id, scopeType: "department", departmentId: department.body.id })).response.status, 403, "không tự gán vai trò");
  assert.equal((await grant(member.id, { roleId: departmentRole.id, scopeType: "department", departmentId: department.body.id })).response.status, 403, "không cấp quyền mình không có");
  assert.equal((await grant(member.id, { roleId: managerRole.id, scopeType: "department_tree", departmentId: department.body.id })).response.status, 403, "không cấp phạm vi cây");
  assert.equal((await grant(member.id, { roleId: superRoleId, scopeType: "department", departmentId: department.body.id })).response.status, 403);
  const granted = await grant(member.id, { roleId: managerRole.id, scopeType: "department", departmentId: department.body.id });
  assert.equal(granted.response.status, 201, JSON.stringify(granted.body));
  const sysopsAssignment = await db("staff_role_assignments").where({ staff_member_id: sysops.id }).first();
  assert.equal((await request(`/staff-members/${sysops.id}/role-assignments/${sysopsAssignment.id}`, { method: "DELETE", auth: managerAuth })).response.status, 403);

  // Department tree: concurrent re-parents never create a cycle; moving to root needs system scope.
  const deptA = await request("/departments", { method: "POST", auth, body: { code: "E2E_DEPT_A", name: "E2E Đơn vị A" } });
  const deptB = await request("/departments", { method: "POST", auth, body: { code: "E2E_DEPT_B", name: "E2E Đơn vị B" } });
  const moves = await Promise.all([
    request(`/departments/${deptA.body.id}`, { method: "PATCH", auth, body: { parentId: deptB.body.id } }),
    request(`/departments/${deptB.body.id}`, { method: "PATCH", auth, body: { parentId: deptA.body.id } }),
  ]);
  assert.deepEqual(moves.map((move) => move.response.status).sort(), [200, 422]);
  const child = (await db("departments").whereIn("id", [deptA.body.id, deptB.body.id]).whereNotNull("parent_id").first());
  assert.ok(child, "đúng một đơn vị được chuyển");
  assert.equal(Number((await db("departments").whereIn("id", [deptA.body.id, deptB.body.id]).whereNull("parent_id").count({ total: "*" }).first()).total), 1);
  assert.equal((await request("/staff-members/" + manager.id + "/role-assignments", { method: "POST", auth, body: { roleId: departmentRole.id, scopeType: "department", departmentId: child.id } })).response.status, 201);
  assert.equal((await request(`/departments/${child.id}`, { method: "PATCH", auth: managerAuth, body: { parentId: null } })).response.status, 403);
  assert.equal((await request(`/departments/${child.id}`, { method: "PATCH", auth: managerAuth, body: { parentId: department.body.id } })).response.status, 403);
  assert.equal((await request(`/departments/${child.id}`, { method: "PATCH", auth: managerAuth, body: { description: "E2E Mô tả" } })).response.status, 200);
  assert.equal((await request("/departments?q=%25", { auth })).body.length, 0, "ký tự % được tìm theo nghĩa đen");

  // Session ids shown to admins are opaque; the raw JWT jti cannot be used to revoke.
  const sessions = await request(`/auth/admin/users/${manager.id}/sessions`, { auth });
  assert.equal(sessions.response.status, 200);
  const rawSession = await db("auth_sessions").where({ user_id: manager.id }).whereNull("revoked_at").first();
  assert.ok(sessions.body.length >= 1);
  assert.ok(sessions.body.every((session) => session.id !== rawSession.id));
  assert.equal((await request(`/auth/admin/users/${manager.id}/sessions/${rawSession.id}`, { method: "DELETE", auth })).response.status, 404);
  assert.equal((await request(`/auth/admin/users/${manager.id}/sessions/${rawSession.public_id}`, { method: "DELETE", auth })).response.status, 200);
  assert.equal((await request("/auth/me", { auth: managerAuth })).response.status, 401);
  assert.equal(managerAuth.sessionId, rawSession.public_id, "đăng nhập trả mã phiên công khai");
  await db("staff_members").where({ id: sysops.id }).update({ is_active: 0 }); // Keep the later "last admin" checks exact.

  // Malformed input never deletes permissions; the final administrator cannot be removed via any API path.
  const adminUserId = auth.user.id;
  const adminAssignment = await db("staff_role_assignments").where({ staff_member_id: adminUserId }).first();
  for (const body of [{}, { actions: null }, { actions: "staff.view" }, { actions: [null] }]) {
    assert.equal((await request(`/roles/${superRole.id}/permissions`, { method: "PUT", auth, body })).response.status, 422);
    assert.deepEqual(await db("role_permissions").where({ role_id: superRole.id }).pluck("action"), ["system.manage"]);
  }
  for (const [route, method, body] of [
    [`/roles/${superRole.id}/permissions`, "PUT", { actions: [] }],
    ["/roles/actions/system.manage", "PATCH", { isActive: false }],
    [`/staff-members/${adminUserId}`, "PATCH", { isActive: false }],
    [`/staff-members/${adminUserId}/role-assignments/${adminAssignment.id}`, "DELETE", undefined],
    [`/staff-members/${adminUserId}/role-assignments/${adminAssignment.id}`, "PATCH", { isActive: false }],
  ]) {
    const rejected = await request(route, { method, auth, body });
    assert.equal(rejected.response.status, 409, `${method} ${route}: ${JSON.stringify(rejected.body)}`);
  }
  const emptyRole = await request("/roles", { method: "POST", auth, body: { name: "e2e_role_clear", label: "E2E Vai trò thường" } });
  assert.equal(emptyRole.response.status, 201);
  assert.equal((await request(`/roles/${emptyRole.body.id}/permissions`, { method: "PUT", auth, body: { actions: ["staff.view", "staff.view"] } })).response.status, 200);
  assert.equal((await request(`/roles/${emptyRole.body.id}/permissions`, { method: "PUT", auth, body: { actions: [] } })).response.status, 200);
  assert.equal((await request(`/roles/${emptyRole.body.id}/permissions`, { method: "PUT", auth, body: { actions: ["system.manage"] } })).response.status, 200);
  assert.equal((await request(`/staff-members/${adminUserId}/role-assignments/${adminAssignment.id}`, { method: "PATCH", auth, body: { roleId: emptyRole.body.id } })).response.status, 200);
  assert.equal((await request(`/roles/${emptyRole.body.id}`, { method: "PATCH", auth, body: { isActive: false } })).response.status, 409);
  assert.equal((await request(`/roles/${emptyRole.body.id}`, { method: "DELETE", auth })).response.status, 409);
  assert.equal((await request(`/staff-members/${adminUserId}/role-assignments/${adminAssignment.id}`, { method: "PATCH", auth, body: { roleId: superRole.id } })).response.status, 200);
  const promotion = await request(`/staff-members/${staff.body.id}/role-assignments`, { method: "POST", auth, body: { roleId: superRole.id, scopeType: "system", isActive: true } });
  assert.equal(promotion.response.status, 201, JSON.stringify(promotion.body));
  assert.equal((await request(`/staff-members/${adminUserId}`, { method: "PATCH", auth: staffAuth, body: { isActive: false } })).response.status, 200);
  assert.equal((await request(`/staff-members/${adminUserId}`, { method: "PATCH", auth: staffAuth, body: { isActive: true } })).response.status, 200);
  auth = await login(bootstrap.body.user.username);

  const notifications = require("../services/notifications.service");
  const notification = await notifications.createNotification({ recipientUserId: auth.user.id, type: "system.test", title: "E2E Thông báo tiếng Việt" }, { dispatchPush: false });
  assert.equal((await request("/notifications/unread-count", { auth })).body.unreadCount, 1);
  assert.equal((await request(`/notifications/${notification.id}/read`, { method: "PATCH", auth })).response.status, 200);
  assert.equal((await request("/notifications/unread-count", { auth })).body.unreadCount, 0);
  await assert.rejects(db("role_permissions").insert({ role_id: "E2E_ROLE_missing", action: "staff.view" }), (error) => error.code === "ER_NO_REFERENCED_ROW_2");
  // Password services preserve validation and revoke all old sessions atomically.
  const temporaryPassword = "E2E_Temporary2026";
  const finalPassword = "E2E_Final2026";
  const reset = await request(`/auth/admin/reset-password/${staff.body.id}`, { method: "POST", auth, body: { password: temporaryPassword, confirmPassword: temporaryPassword } });
  assert.equal(reset.response.status, 200, JSON.stringify(reset.body));
  assert.equal((await request("/auth/me", { auth: staffAuth })).response.status, 401);
  const temporaryAuth = await login("E2E_USER_staff", temporaryPassword);
  assert.equal(temporaryAuth.user.mustChangePassword, true);
  assert.equal((await request("/roles/actions", { auth: temporaryAuth })).response.status, 403);
  const invalidChange = await request("/auth/change-password", { method: "POST", auth: temporaryAuth, body: { currentPassword: "wrong-password", newPassword: finalPassword, confirmPassword: finalPassword } });
  assert.equal(invalidChange.response.status, 422);
  const changed = await request("/auth/change-password", { method: "POST", auth: temporaryAuth, body: { currentPassword: temporaryPassword, newPassword: finalPassword, confirmPassword: finalPassword } });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.user.mustChangePassword, false);
  assert.equal((await request("/auth/me", { auth: temporaryAuth })).response.status, 401);
  await login("E2E_USER_staff", finalPassword);

  const { withAdminSafetyMutation, countActiveAdministrators } = require("../services/admin-safety.service");
  const removals = await Promise.allSettled([adminUserId, staff.body.id].map((id) => withAdminSafetyMutation((trx) => trx("staff_members").where({ id }).update({ is_active: 0 }))));
  assert.equal(removals.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(removals.find((result) => result.status === "rejected").reason.statusCode, 409);
  assert.equal(await countActiveAdministrators(db), 1);
  // A previously initialized database never reopens public bootstrap, even after an out-of-band outage.
  await db("staff_members").update({ is_active: 0 });
  assert.equal((await request("/auth/bootstrap-admin", { method: "POST", headers: bootstrapHeaders, body: { username: "E2E_USER_reopen", password } })).response.status, 409);
  await db("staff_members").where({ id: adminUserId }).update({ is_active: 1 });
  assert.equal((await request("/auth/logout", { method: "POST", auth })).response.status, 200);
  assert.equal((await request("/auth/me", { auth })).response.status, 401);
});
