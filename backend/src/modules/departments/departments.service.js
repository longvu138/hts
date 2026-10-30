const db = require("../../config/database");
const { mapDepartment } = require("./departments.mapper");
const permissionsService = require("../../services/permissions.service");
const { buildDepartmentTree, wouldCreateDepartmentCycle } = require("../../services/org.service");
const { createUuid } = require("../../utils/uuid");
const { httpError: createHttpError } = require("../../utils/http-error");
const { containsPattern } = require("../../utils/sql-like");
const {
  isBlank,
  normalizeOptionalString,
  pickDefined,
  requireFields,
  toBooleanFlag,
} = require("../../utils/validation");

const DEPARTMENT_TYPES = new Set(["van_phong", "cuc_vu", "phong", "to_nhom"]);

// Reference list without pagination (used for tree/select); capped to protect memory.
const DEPARTMENT_LIST_LIMIT = 500;

const pickPayload = (body) =>
  pickDefined(body, {
    code: "code",
    name: "name",
    parentId: (value) => ({ parent_id: value || null }),
    type: (value) => ({ type: value || "phong" }),
    sortOrder: (value) => ({ sort_order: Number(value || 0) }),
    description: (value) => ({ description: normalizeOptionalString(value) }),
    isActive: (value) => ({ is_active: toBooleanFlag(value) }),
  });

const applyVisibleScope = (query, visibleScope) => {
  const { hasViewAll, departmentIds: deptIds } = visibleScope;
  if (hasViewAll) return;

  if (deptIds.length > 0) {
    query.whereIn("id", deptIds);
  } else {
    query.whereRaw("1 = 0");
  }
};

const applyDepartmentOrdering = (query) =>
  query.orderBy([
    { column: "sort_order" },
    { column: "name" },
    { column: "id" },
  ]).limit(DEPARTMENT_LIST_LIMIT);

const listDepartments = async ({ query: requestQuery = {}, visibleScope }) => {
  const query = applyDepartmentOrdering(db("departments"));

  if (requestQuery.q) {
    const search = containsPattern(String(requestQuery.q).slice(0, 200));
    query.where((builder) => {
      builder
        .where("name", "like", search)
        .orWhere("code", "like", search);
    });
  }

  if (requestQuery.isActive !== undefined) {
    query.where("is_active", requestQuery.isActive === "false" ? 0 : 1);
  }

  applyVisibleScope(query, visibleScope);
  return (await query).map(mapDepartment);
};

const listDepartmentTree = async ({ query: requestQuery = {}, visibleScope }) => {
  const query = applyDepartmentOrdering(db("departments"));

  if (requestQuery.isActive !== undefined) {
    query.where("is_active", requestQuery.isActive === "false" ? 0 : 1);
  }

  applyVisibleScope(query, visibleScope);
  return buildDepartmentTree((await query).map(mapDepartment));
};

const getDepartmentById = async (departmentId) => db("departments").where({ id: departmentId }).first();

const getDepartment = async (departmentId) => {
  const department = await getDepartmentById(departmentId);
  if (!department) {
    throw createHttpError(404, "Không tìm thấy phòng ban tương ứng");
  }
  return mapDepartment(department);
};

const validateCreateDepartmentPayload = async (body) => {
  const errorResult = requireFields(body, {
    code: "Mã phòng ban",
    name: "Tên phòng ban",
  });
  if (errorResult) {
    throw createHttpError(422, errorResult.error);
  }

  const existing = await db("departments")
    .where({ code: body.code })
    .orWhere({ name: body.name })
    .first();
  if (existing) {
    throw createHttpError(422, "Mã hoặc tên phòng ban đã tồn tại");
  }

  if (body.parentId) {
    const parent = await getDepartmentById(body.parentId);
    if (!parent) {
      throw createHttpError(422, "Không tìm thấy phòng ban cha tương ứng");
    }
  }
  if (body.type && !DEPARTMENT_TYPES.has(body.type)) {
    throw createHttpError(422, "Loại đơn vị không hợp lệ");
  }
};

const createDepartment = async (body) => {
  await validateCreateDepartmentPayload(body);

  const id = createUuid();
  await db("departments").insert({ id, ...pickPayload(body) });
  permissionsService.invalidatePermissionCache();
  return getDepartment(id);
};

const validateUpdateDepartmentPayload = async (departmentId, body) => {
  if (body.code !== undefined && isBlank(body.code)) {
    throw createHttpError(422, "Mã phòng ban không được để trống");
  }
  if (body.name !== undefined && isBlank(body.name)) {
    throw createHttpError(422, "Tên phòng ban không được để trống");
  }

  if (body.parentId) {
    if (body.parentId === departmentId) {
      throw createHttpError(422, "Đơn vị cha không được là chính nó hoặc đơn vị con của nó");
    }
    const parent = await getDepartmentById(body.parentId);
    if (!parent) {
      throw createHttpError(422, "Không tìm thấy phòng ban cha tương ứng");
    }
  }
  if (body.type && !DEPARTMENT_TYPES.has(body.type)) {
    throw createHttpError(422, "Loại đơn vị không hợp lệ");
  }

  if (body.code || body.name) {
    const duplicate = await db("departments")
      .where((builder) => {
        if (body.code) builder.orWhere({ code: body.code });
        if (body.name) builder.orWhere({ name: body.name });
      })
      .whereNot({ id: departmentId })
      .first();

    if (duplicate) {
      throw createHttpError(422, "Mã hoặc tên phòng ban đã tồn tại");
    }
  }
};

const updateDepartment = async (departmentId, body) => {
  await validateUpdateDepartmentPayload(departmentId, body);

  await db.transaction(async (trx) => {
    if (body.parentId) {
      // Lock every department row (PK order) so concurrent re-parents are serialized and the
      // cycle check reads the latest committed tree, never a stale snapshot.
      const allDepartments = await trx("departments").select("id", "parent_id").orderBy("id").forUpdate();
      if (wouldCreateDepartmentCycle(allDepartments, departmentId, body.parentId)) {
        throw createHttpError(422, "Đơn vị cha không được là chính nó hoặc đơn vị con của nó");
      }
    }
    await trx("departments").where({ id: departmentId }).update(pickPayload(body));
  });
  permissionsService.invalidatePermissionCache();
  return getDepartment(departmentId);
};

module.exports = {
  DEPARTMENT_LIST_LIMIT,
  createDepartment,
  getDepartment,
  getDepartmentById,
  listDepartmentTree,
  listDepartments,
  updateDepartment,
};
