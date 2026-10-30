// Initial schema for new installations.
const TABLES = Object.freeze(['departments', 'staff_members', 'roles', 'permission_actions', 'role_permissions', 'staff_role_assignments', 'staff_role_assignment_departments', 'auth_sessions', 'notifications', 'push_subscriptions', 'administration_state']);
const SUPERADMIN_ROLE_ID = "33333333-3333-4333-8333-333333333301";

exports.up = async function up(knex) {
  for (const table of TABLES) {
    if (await knex.schema.hasTable(table)) {
      throw new Error("Migration khởi tạo chỉ chạy trên database trắng; bảng đã tồn tại: " + table);
    }
  }
  await knex.raw(`
    CREATE TABLE departments (
      id char(36) NOT NULL,
      code varchar(50) NOT NULL,
      name varchar(255) NOT NULL,
      parent_id char(36) DEFAULT NULL,
      type varchar(50) NOT NULL DEFAULT 'phong',
      sort_order int(11) NOT NULL DEFAULT 0,
      description text DEFAULT NULL,
      is_active tinyint(1) NOT NULL DEFAULT 1,
      created_at timestamp NULL DEFAULT current_timestamp(),
      updated_at timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE departments
      ADD PRIMARY KEY (id),
      ADD UNIQUE KEY uq_departments_code (code),
      ADD UNIQUE KEY uq_departments_name (name),
      ADD KEY fk_departments_parent_id (parent_id),
      ADD KEY idx_departments_type (type),
      ADD KEY idx_departments_sort_order (sort_order),
      ADD KEY idx_departments_is_active (is_active)
  `);
  await knex.raw(`
    ALTER TABLE departments
      ADD CONSTRAINT fk_departments_parent_id FOREIGN KEY (parent_id) REFERENCES departments (id) ON DELETE SET NULL
  `);
  await knex.raw(`
    CREATE TABLE staff_members (
      id char(36) NOT NULL,
      code varchar(50) NOT NULL,
      username varchar(191) DEFAULT NULL,
      full_name varchar(150) NOT NULL,
      position varchar(150) DEFAULT NULL,
      department_id char(36) DEFAULT NULL,
      email varchar(191) DEFAULT NULL,
      phone varchar(30) DEFAULT NULL,
      password_hash varchar(255) DEFAULT NULL,
      token_version int unsigned NOT NULL DEFAULT 0,
      is_active tinyint(1) NOT NULL DEFAULT 1,
      must_change_password tinyint(1) NOT NULL DEFAULT 1,
      password_changed_at timestamp NULL DEFAULT NULL,
      password_reset_at timestamp NULL DEFAULT NULL,
      password_reset_by char(36) DEFAULT NULL,
      last_login_at timestamp NULL DEFAULT NULL,
      created_at timestamp NULL DEFAULT current_timestamp(),
      updated_at timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE staff_members
      ADD PRIMARY KEY (id),
      ADD UNIQUE KEY uq_staff_members_code (code),
      ADD UNIQUE KEY uq_staff_members_username (username),
      ADD UNIQUE KEY uq_staff_members_email (email),
      ADD KEY fk_staff_members_department_id (department_id),
      ADD KEY fk_staff_members_password_reset_by (password_reset_by),
      ADD KEY idx_staff_members_full_name (full_name),
      ADD KEY idx_staff_members_is_active (is_active),
      ADD KEY idx_staff_members_must_change_password (must_change_password)
  `);
  await knex.raw(`
    ALTER TABLE staff_members
      ADD CONSTRAINT fk_staff_members_department_id FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL,
      ADD CONSTRAINT fk_staff_members_password_reset_by FOREIGN KEY (password_reset_by) REFERENCES staff_members (id) ON DELETE SET NULL
  `);
  await knex.raw(`
    CREATE TABLE roles (
      id char(36) NOT NULL,
      name varchar(100) NOT NULL,
      label varchar(200) DEFAULT NULL,
      level int(11) NOT NULL DEFAULT 0 COMMENT 'Cấp độ: số càng cao càng nhiều quyền',
      is_system tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 = role hệ thống scope toàn cục',
      is_active tinyint(1) NOT NULL DEFAULT 1,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE roles
      ADD PRIMARY KEY (id),
      ADD UNIQUE KEY uq_roles_name (name),
      ADD KEY idx_roles_level (level),
      ADD KEY idx_roles_is_active (is_active),
      ADD KEY idx_roles_is_system (is_system)
  `);
  await knex.raw(`
    CREATE TABLE permission_actions (
      name varchar(100) NOT NULL,
      label varchar(200) NOT NULL,
      group_name varchar(100) NOT NULL,
      description text DEFAULT NULL,
      sort_order int(11) NOT NULL DEFAULT 0,
      is_active tinyint(1) NOT NULL DEFAULT 1,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE permission_actions
      ADD PRIMARY KEY (name),
      ADD KEY idx_pa_group_name (group_name),
      ADD KEY idx_pa_is_active (is_active)
  `);
  await knex.raw(`
    CREATE TABLE role_permissions (
      role_id char(36) NOT NULL,
      action varchar(100) NOT NULL,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE role_permissions
      ADD PRIMARY KEY (role_id, action),
      ADD KEY idx_role_permissions_action (action)
  `);
  await knex.raw(`
    ALTER TABLE role_permissions
      ADD CONSTRAINT fk_role_permissions_role_id FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_role_permissions_action FOREIGN KEY (action) REFERENCES permission_actions (name) ON DELETE CASCADE
  `);
  await knex.raw(`
    CREATE TABLE staff_role_assignments (
      id char(36) NOT NULL,
      staff_member_id char(36) NOT NULL,
      role_id char(36) NOT NULL,
      scope_type enum('system','department','department_tree','specific_departments') NOT NULL DEFAULT 'department',
      department_id char(36) DEFAULT NULL COMMENT 'Dùng cho scope = department hoặc department_tree',
      is_active tinyint(1) NOT NULL DEFAULT 1,
      created_at timestamp NOT NULL DEFAULT current_timestamp(),
      updated_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE staff_role_assignments
      ADD PRIMARY KEY (id),
      ADD KEY fk_sra_staff_member_id (staff_member_id),
      ADD KEY fk_sra_role_id (role_id),
      ADD KEY fk_sra_department_id (department_id),
      ADD KEY idx_sra_is_active (is_active),
      ADD KEY idx_sra_scope_type (scope_type),
      ADD KEY idx_sra_role_active (role_id, is_active),
      ADD KEY idx_sra_scope_department (scope_type, department_id)
  `);
  await knex.raw(`
    ALTER TABLE staff_role_assignments
      ADD CONSTRAINT fk_sra_staff_member_id FOREIGN KEY (staff_member_id) REFERENCES staff_members (id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_sra_role_id FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT,
      ADD CONSTRAINT fk_sra_department_id FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE SET NULL
  `);
  await knex.raw(`
    CREATE TABLE staff_role_assignment_departments (
      assignment_id char(36) NOT NULL,
      department_id char(36) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await knex.raw(`
    ALTER TABLE staff_role_assignment_departments
      ADD PRIMARY KEY (assignment_id, department_id),
      ADD KEY fk_srad_department_id (department_id),
      ADD KEY idx_srad_department (department_id)
  `);
  await knex.raw(`
    ALTER TABLE staff_role_assignment_departments
      ADD CONSTRAINT fk_srad_assignment_id FOREIGN KEY (assignment_id) REFERENCES staff_role_assignments (id) ON DELETE CASCADE,
      ADD CONSTRAINT fk_srad_department_id FOREIGN KEY (department_id) REFERENCES departments (id) ON DELETE CASCADE
  `);
  await knex.raw(`
    ALTER TABLE staff_members ADD KEY idx_staff_active_name (is_active, full_name)
  `);
  await knex.raw(`
    ALTER TABLE staff_role_assignments ADD KEY idx_staff_role_assignments_staff_active (staff_member_id, is_active)
  `);

  await knex.schema.createTable('auth_sessions', (table) => {
      table.engine("InnoDB");
      table.charset("utf8mb4");
      table.collate("utf8mb4_unicode_ci");
      table.specificType("id", "char(36)").primary();
      table.specificType("user_id", "char(36)").notNullable();
      // Opaque id shown to administrators; the primary id is the JWT jti and stays server-side.
      table.specificType("public_id", "char(36)").notNullable();
      table.integer("token_version").unsigned().notNullable().defaultTo(0);
      table.string("ip_address", 64).nullable();
      table.text("user_agent").nullable();
      table.string("browser", 100).nullable();
      table.string("operating_system", 100).nullable();
      table.string("device_type", 30).nullable();
      // DATETIME avoids MySQL/MariaDB adding an implicit ON UPDATE clause.
      table.datetime("expires_at").notNullable();
      table.timestamp("last_seen_at").nullable();
      table.timestamp("revoked_at").nullable();
      table.specificType("revoked_by", "char(36)").nullable();
      table.string("revoke_reason", 100).nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.unique(["public_id"], "uq_auth_sessions_public_id");
      table.index(["user_id", "revoked_at"], "idx_auth_sessions_user_revoked");
      table.index(["expires_at"], "idx_auth_sessions_expires");
      table.foreign("user_id").references("id").inTable("staff_members").onDelete("CASCADE");
      table.foreign("revoked_by").references("id").inTable("staff_members").onDelete("SET NULL");
    });
  await knex.schema.createTable('notifications', (table) => {
      table.engine("InnoDB");
      table.charset("utf8mb4");
      table.collate("utf8mb4_unicode_ci");
      table.specificType("id", "char(36)").primary();
      table.specificType("recipient_user_id", "char(36)").notNullable();
      table.string("type", 100).notNullable();
      table.string("title", 255).notNullable();
      table.text("message").nullable();
      table.string("entity_type", 50).nullable();
      table.specificType("entity_id", "char(36)").nullable();
      table.json("metadata").nullable();
      table.timestamp("read_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"));

      table.index(["recipient_user_id", "created_at"], "idx_notifications_recipient_created");
      table.index(["recipient_user_id", "read_at"], "idx_notifications_recipient_read");
      table.index(["entity_type", "entity_id"], "idx_notifications_entity");
      table
        .foreign("recipient_user_id")
        .references("id")
        .inTable("staff_members")
        .onDelete("CASCADE");
    });
  await knex.schema.createTable('push_subscriptions', (table) => {
      table.engine("InnoDB");
      table.charset("utf8mb4");
      table.collate("utf8mb4_unicode_ci");
      table.specificType("id", "char(36)").primary();
      table.specificType("user_id", "char(36)").notNullable();
      table.text("endpoint").notNullable();
      table.string("endpoint_hash", 64).notNullable();
      table.text("p256dh").notNullable();
      table.text("auth").notNullable();
      table.text("user_agent").nullable();
      table.timestamp("last_used_at").nullable();
      table.timestamp("revoked_at").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.raw("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"));

      table.unique(["endpoint_hash"], "uq_push_subscriptions_endpoint_hash");
      table.index(["user_id", "revoked_at"], "idx_push_subscriptions_user_revoked");
      table
        .foreign("user_id")
        .references("id")
        .inTable("staff_members")
        .onDelete("CASCADE");
    });

  // A persistent singleton serializes setup and mutations affecting administrator access.
  await knex.schema.createTable("administration_state", (table) => {
    table.engine("InnoDB");
    table.charset("utf8mb4");
    table.collate("utf8mb4_unicode_ci");
    table.integer("id").primary();
    table.boolean("bootstrap_completed").notNullable().defaultTo(false);
  });

  await knex.transaction(async (trx) => {
    await trx("roles").insert({ id: SUPERADMIN_ROLE_ID, name: "superadmin", label: "Quản trị tối cao", level: 100, is_system: 1, is_active: 1 });
    await trx("permission_actions").insert([
      { name: "department.view", label: "Xem phòng ban", group_name: "department", sort_order: 1 },
      { name: "department.manage", label: "Quản lý phòng ban", group_name: "department", sort_order: 2 },
      { name: "staff.view", label: "Xem cán bộ", group_name: "staff", sort_order: 3 },
      { name: "staff.manage", label: "Quản lý cán bộ", group_name: "staff", sort_order: 4 },
      { name: "system.manage", label: "Quản trị hệ thống", group_name: "system", sort_order: 5 },
    ]);
    await trx("role_permissions").insert({ role_id: SUPERADMIN_ROLE_ID, action: "system.manage" });
    await trx("administration_state").insert({ id: 1, bootstrap_completed: false });
  });
};

exports.down = async function down(knex) {
  for (const table of [...TABLES].reverse()) {
    await knex.schema.dropTableIfExists(table);
  }
};

// MySQL DDL commits implicitly. Only the seed data uses a transaction.
exports.config = { transaction: false };
