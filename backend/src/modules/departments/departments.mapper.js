const mapDepartment = (department) => ({
  id: department.id,
  code: department.code,
  name: department.name,
  parentId: department.parent_id,
  type: department.type || "phong",
  sortOrder: Number(department.sort_order || 0),
  description: department.description,
  isActive: Boolean(department.is_active),
  createdAt: department.created_at,
  updatedAt: department.updated_at,
});

module.exports = {
  mapDepartment,
};
