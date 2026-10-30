const normalizeParentId = (value) => value || null;

const sortDepartments = (departments = []) =>
  [...departments].sort((left, right) => {
    const leftOrder = Number(left.sortOrder ?? left.sort_order ?? 0);
    const rightOrder = Number(right.sortOrder ?? right.sort_order ?? 0);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const leftName = left.name || "";
    const rightName = right.name || "";
    const nameCompare = leftName.localeCompare(rightName, "vi");
    if (nameCompare !== 0) return nameCompare;
    return String(left.id).localeCompare(String(right.id));
  });

const buildDepartmentTree = (departments = []) => {
  const nodeMap = new Map(
    departments.map((department) => [
      department.id,
      { ...department, children: [] },
    ]),
  );
  const roots = [];

  sortDepartments([...nodeMap.values()]).forEach((department) => {
    const parentId = normalizeParentId(department.parentId ?? department.parent_id);
    const parent = parentId ? nodeMap.get(parentId) : null;
    if (parent) {
      parent.children.push(department);
    } else {
      roots.push(department);
    }
  });

  const sortChildren = (items) => {
    sortDepartments(items).forEach((item, index, sorted) => {
      items[index] = sorted[index];
    });
    items.forEach((item) => sortChildren(item.children || []));
  };
  sortChildren(roots);

  return roots;
};

const getDescendantDepartmentIds = (departments = [], departmentId) => {
  const childrenByParent = departments.reduce((grouped, department) => {
    const parentId = normalizeParentId(department.parentId ?? department.parent_id);
    if (!parentId) return grouped;
    grouped[parentId] = grouped[parentId] || [];
    grouped[parentId].push(department.id);
    return grouped;
  }, {});

  // Visited guard: corrupted (cyclic) data must never hang the request.
  const descendants = [];
  const visited = new Set([departmentId]);
  const stack = [...(childrenByParent[departmentId] || [])];
  while (stack.length) {
    const currentId = stack.pop();
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    descendants.push(currentId);
    stack.push(...(childrenByParent[currentId] || []));
  }
  return descendants;
};

const isDepartmentInTree = (departments = [], childId, rootId) => {
  if (!childId || !rootId) return false;
  if (childId === rootId) return true;
  return getDescendantDepartmentIds(departments, rootId).includes(childId);
};

const wouldCreateDepartmentCycle = (departments = [], departmentId, nextParentId) => {
  if (!departmentId || !nextParentId) return false;
  if (departmentId === nextParentId) return true;
  return isDepartmentInTree(departments, nextParentId, departmentId);
};

module.exports = {
  buildDepartmentTree,
  getDescendantDepartmentIds,
  wouldCreateDepartmentCycle,
};
