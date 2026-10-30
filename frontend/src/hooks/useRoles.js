import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rolesApi } from "../api/rolesApi";

const EMPTY_LIST = [];

const roleKeys = {
  all: ["roles"],
  list: ["roles", "list"],
  actions: ["permission-actions"],
  matrix: ["roles", "permissions-matrix"],
};

export const useRoles = () => {
  const query = useQuery({ queryKey: roleKeys.list, queryFn: rolesApi.listRoles });
  return { ...query, roles: Array.isArray(query.data) ? query.data : EMPTY_LIST };
};

export const usePermissionActions = () => {
  const query = useQuery({ queryKey: roleKeys.actions, queryFn: rolesApi.listActions });
  return { ...query, actions: Array.isArray(query.data) ? query.data : EMPTY_LIST };
};

export const useRolePermissionsMatrix = () => {
  const query = useQuery({ queryKey: roleKeys.matrix, queryFn: rolesApi.getPermissionsMatrix });
  return { ...query, matrix: query.data && typeof query.data === "object" ? query.data : {} };
};

const useRoleMutation = (mutationFn, { invalidateActions = false, onSuccess, onError } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: roleKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["staff-members", "assignment-options"] }),
        queryClient.invalidateQueries({ queryKey: roleKeys.matrix }),
        ...(invalidateActions
          ? [queryClient.invalidateQueries({ queryKey: roleKeys.actions })]
          : []),
      ]);
      onSuccess?.(data);
    },
    onError,
  });
};

export const useSaveRole = ({ roleId, ...options } = {}) =>
  useRoleMutation(
    (values) => roleId ? rolesApi.updateRole(roleId, values) : rolesApi.createRole(values),
    options,
  );

export const useDeleteRole = (options = {}) =>
  useRoleMutation((id) => rolesApi.deleteRole(id), options);

export const useUpdateRolePermissions = (options = {}) =>
  useRoleMutation(
    ({ roleId, actions }) => rolesApi.updateRolePermissions(roleId, actions),
    options,
  );

export const useToggleRolePermission = (options = {}) =>
  useRoleMutation(({ roleId, action, checked, currentActions }) => {
    const actions = checked
      ? [...new Set([...currentActions, action])]
      : currentActions.filter((item) => item !== action);
    return rolesApi.updateRolePermissions(roleId, actions);
  }, options);

export const useSavePermissionAction = ({ actionName, ...options } = {}) =>
  useRoleMutation(
    (values) => actionName
      ? rolesApi.updateAction(actionName, values)
      : rolesApi.createAction(values),
    { ...options, invalidateActions: true },
  );
