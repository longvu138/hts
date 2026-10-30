const { httpError } = require("../../utils/http-error");
const validateRolePermissions = (body) => {
  const actions = body?.actions;
  if (!Array.isArray(actions) || actions.some((action) => typeof action !== "string" || !action.trim())) {
    throw httpError(422, "Danh sách quyền phải là một mảng tên quyền hợp lệ");
  }
  return [...new Set(actions)];
};
module.exports = { validateRolePermissions };
