import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { departmentsApi } from "../api/departmentsApi";

const EMPTY_DEPARTMENTS = [];

const departmentKeys = {
  all: ["departments"],
  list: (params = {}) => ["departments", "list", params],
  tree: (params = {}) => ["departments", "tree", params],
};

const normalizeDepartments = (data) =>
  Array.isArray(data) ? data : EMPTY_DEPARTMENTS;

export const useDepartments = (params = {}, options = {}) => {
  const query = useQuery({
    queryKey: departmentKeys.list(params),
    queryFn: () => departmentsApi.list(params),
    enabled: options.enabled !== false,
  });
  return { ...query, departments: normalizeDepartments(query.data) };
};

export const useDepartmentTree = (params = {}) => {
  const query = useQuery({
    queryKey: departmentKeys.tree(params),
    queryFn: () => departmentsApi.tree(params),
  });
  return { ...query, departments: normalizeDepartments(query.data) };
};

export const useSaveDepartment = ({ departmentId, onSuccess, onError } = {}) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) =>
      departmentId
        ? departmentsApi.update(departmentId, values)
        : departmentsApi.create(values),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: departmentKeys.all });
      onSuccess?.(data);
    },
    onError,
  });
};
