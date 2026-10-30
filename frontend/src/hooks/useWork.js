import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workApi } from "../api/workApi";
import { shouldRefreshAfterWorkError } from "../utils/workErrors";

import { workKeys } from "../constants/workQueryKeys";
export { workKeys } from "../constants/workQueryKeys";

export const useWork = (mode, params, { enabled = true } = {}) => useQuery({
  queryKey: workKeys.list(mode, params),
  enabled,
  queryFn: () => mode === "situation" ? workApi.schedule(params) : workApi.list({ ...params, mode }),
});

export const useWorkDetail = (id, page, historyPage = 1) => useQuery({
  queryKey: workKeys.detail(id, page, historyPage),
  queryFn: () => workApi.detail(id, { page, limit: 20, historyPage }),
  enabled: Boolean(id),
});

export const useWorkRecipients = (enabled, search, mode = "assign", id, actorId) => useQuery({
  queryKey: workKeys.recipients(mode, search, id, actorId),
  staleTime: 0,
  queryFn: () => workApi.recipients({ q: search || undefined, mode, id, limit: 50 }),
  enabled,
});

export const useWorkDepartments = (enabled, search = "") => useQuery({
  queryKey: workKeys.departments(search),
  queryFn: () => workApi.departments({ q: search || undefined, limit: 100 }),
  enabled,
});

export const useWorkAvailability = (body) => useQuery({
  queryKey: workKeys.availability(body),
  queryFn: () => workApi.availability(body),
  enabled: Boolean(body),
  retry: false,
  staleTime: 0,
  gcTime: 0,
});

// Writes change lists, details and busy slots only; recipient/department lookups stay cached.
const invalidateWorkData = (client) => Promise.all([
  client.invalidateQueries({ queryKey: workKeys.lists() }),
  client.invalidateQueries({ queryKey: workKeys.details() }),
  client.invalidateQueries({ queryKey: workKeys.availabilityAll() }),
]);

export const useWorkMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id, body }) => {
      if (action === "create") return workApi.create(body);
      if (action === "info") return workApi.updateInfo(id, body);
      return workApi.action(action, id, body);
    },
    onError: async (error) => {
      if (shouldRefreshAfterWorkError(error)) await invalidateWorkData(client);
    },
    onSuccess: async () => {
      await Promise.all([invalidateWorkData(client), client.invalidateQueries({ queryKey: ["notifications"] })]);
    },
  });
};
