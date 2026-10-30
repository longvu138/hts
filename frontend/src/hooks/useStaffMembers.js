import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/authApi'
import { staffMembersApi } from '../api/staffMembersApi'

const EMPTY_STAFF = []
const DEFAULT_PAGINATION = { page: 1, limit: 25, total: 0, totalPages: 0 }

export const useStaffMembers = (params = {}, options = {}) => {
  const query = useQuery({
    queryKey: ['staff-members', 'list', params],
    queryFn: () => staffMembersApi.list(params),
    enabled: options.enabled !== false,
    placeholderData: keepPreviousData,
  })

  return {
    ...query,
    staffMembers: Array.isArray(query.data?.staffMembers)
      ? query.data.staffMembers
      : EMPTY_STAFF,
    pagination: query.data?.pagination && typeof query.data.pagination === 'object'
      ? query.data.pagination
      : DEFAULT_PAGINATION,
  }
}

const invalidateStaff = (queryClient) => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['staff-members'] }),
])

export const useStaffRoles = () => {
  const query = useQuery({ queryKey: ['roles'], queryFn: staffMembersApi.listRoles })
  return { ...query, roles: Array.isArray(query.data) ? query.data : [] }
}

export const useAssignmentOptions = (enabled) => useQuery({
  queryKey: ['staff-members', 'assignment-options'],
  queryFn: staffMembersApi.assignmentOptions,
  enabled,
});

export const useStaffRoleAssignments = (staffMemberId, options = {}) => {
  const query = useQuery({
    queryKey: ['staff-members', staffMemberId, 'role-assignments'],
    queryFn: () => staffMembersApi.listRoleAssignments(staffMemberId),
    enabled: Boolean(staffMemberId) && options.enabled !== false,
  })
  return { ...query, assignments: Array.isArray(query.data) ? query.data : [] }
}

export const useUserSessions = (userId) => {
  const query = useQuery({
    queryKey: ['auth-sessions', userId],
    queryFn: () => authApi.listUserSessions(userId),
    enabled: Boolean(userId),
  })
  return { ...query, sessions: Array.isArray(query.data) ? query.data : [] }
}

export const useSaveStaffMember = ({ staffMemberId, onSuccess, onError } = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values) => staffMemberId
      ? staffMembersApi.update(staffMemberId, values)
      : staffMembersApi.create(values),
    onSuccess: async (data) => {
      await invalidateStaff(queryClient)
      onSuccess?.(data)
    },
    onError,
  })
}

export const useResetStaffPassword = ({ onSuccess, onError } = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, values }) => authApi.resetPassword(userId, values),
    onSuccess: async (data) => {
      await invalidateStaff(queryClient)
      onSuccess?.(data)
    },
    onError,
  })
}

export const useRevokeUserSession = ({ userId, onSuccess, onError } = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId) => authApi.revokeUserSession(userId, sessionId),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['auth-sessions', userId] })
      onSuccess?.(data)
    },
    onError,
  })
}

export const useRevokeAllUserSessions = ({ userId, exceptCurrent, onSuccess, onError } = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authApi.revokeAllUserSessions(userId, { exceptCurrent }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['auth-sessions', userId] })
      onSuccess?.(data)
    },
    onError,
  })
}

const useRoleAssignmentMutation = (mutationFn, { staffMemberId, onSuccess, onError } = {}) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: async (data) => {
      await Promise.all([
        invalidateStaff(queryClient),
        queryClient.invalidateQueries({ queryKey: ['staff-members', staffMemberId, 'role-assignments'] }),
      ])
      onSuccess?.(data)
    },
    onError,
  })
}

export const useSaveStaffRoleAssignment = ({ staffMemberId, assignmentId, ...options } = {}) =>
  useRoleAssignmentMutation(
    (values) => assignmentId
      ? staffMembersApi.updateRoleAssignment(staffMemberId, assignmentId, values)
      : staffMembersApi.createRoleAssignment(staffMemberId, values),
    { staffMemberId, ...options },
  )

export const useDisableStaffRoleAssignment = ({ staffMemberId, ...options } = {}) =>
  useRoleAssignmentMutation(
    (assignmentId) => staffMembersApi.disableRoleAssignment(staffMemberId, assignmentId),
    { staffMemberId, ...options },
  )
