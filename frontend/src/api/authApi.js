import { httpClient } from './httpClient'

export const authApi = {
  login: async (payload) => {
    const { data } = await httpClient.post('/auth/login', payload, { skipGlobalError: true })
    return data
  },
  resetPassword: async (userId, payload) => {
    const { data } = await httpClient.post(`/auth/admin/reset-password/${userId}`, payload)
    return data
  },
  changePassword: async (payload) => {
    const { data } = await httpClient.post('/auth/change-password', payload, { skipGlobalError: true })
    return data
  },
  logout: async () => {
    const { data } = await httpClient.post('/auth/logout', null, { skipAuthCleanup: true })
    return data
  },
  listUserSessions: async (userId) => {
    const { data } = await httpClient.get(`/auth/admin/users/${userId}/sessions`)
    return Array.isArray(data) ? data : []
  },
  revokeUserSession: async (userId, sessionId) => {
    const { data } = await httpClient.delete(`/auth/admin/users/${userId}/sessions/${sessionId}`)
    return data
  },
  revokeAllUserSessions: async (userId, options = {}) => {
    const { data } = await httpClient.post(`/auth/admin/users/${userId}/sessions/revoke-all`, options)
    return data
  },
  me: async () => {
    const { data } = await httpClient.get('/auth/me')
    return data
  },
}
