import { httpClient } from './httpClient'

const normalizeStaffPageResponse = (data, params = {}) => {
  const staffMembers = Array.isArray(data?.staffMembers) ? data.staffMembers : []
  const fallbackLimit = Number(params.limit) || 25
  return {
    staffMembers,
    pagination: data?.pagination && typeof data.pagination === 'object'
      ? {
          page: Number(data.pagination.page) || 1,
          limit: Number(data.pagination.limit) || fallbackLimit,
          total: Number(data.pagination.total) || 0,
          totalPages: Number(data.pagination.totalPages) || 0,
        }
      : {
          page: Number(params.page) || 1,
          limit: fallbackLimit,
          total: staffMembers.length,
          totalPages: staffMembers.length ? 1 : 0,
        },
  }
}

export const staffMembersApi = {
  assignmentOptions: async () => {
    const { data } = await httpClient.get('/staff-members/assignment-options');
    return { roles: Array.isArray(data?.roles) ? data.roles : [], scopes: Array.isArray(data?.scopes) ? data.scopes : [], departments: Array.isArray(data?.departments) ? data.departments : [], canAssignToSelf: Boolean(data?.canAssignToSelf), truncated: Boolean(data?.truncated) };
  },
  list: async (params = {}) => {
    const { data } = await httpClient.get('/staff-members', { params })
    return normalizeStaffPageResponse(data, params)
  },
  create: async (payload) => {
    const { data } = await httpClient.post('/staff-members', payload)
    return data
  },
  update: async (id, payload) => {
    const { data } = await httpClient.patch(`/staff-members/${id}`, payload)
    return data
  },
  listRoles: async () => {
    const { data } = await httpClient.get('/roles')
    return Array.isArray(data) ? data : []
  },
  listRoleAssignments: async (staffMemberId) => {
    const { data } = await httpClient.get(`/staff-members/${staffMemberId}/role-assignments`)
    return Array.isArray(data) ? data : []
  },
  createRoleAssignment: async (staffMemberId, payload) => {
    const { data } = await httpClient.post(`/staff-members/${staffMemberId}/role-assignments`, payload)
    return data
  },
  updateRoleAssignment: async (staffMemberId, assignmentId, payload) => {
    const { data } = await httpClient.patch(`/staff-members/${staffMemberId}/role-assignments/${assignmentId}`, payload)
    return data
  },
  disableRoleAssignment: async (staffMemberId, assignmentId) => {
    const { data } = await httpClient.delete(`/staff-members/${staffMemberId}/role-assignments/${assignmentId}`)
    return data
  },
}
