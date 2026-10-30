import { httpClient } from './httpClient'

export const rolesApi = {
  // Roles
  listRoles: () => httpClient.get('/roles').then((r) => r.data),
  createRole: (data) => httpClient.post('/roles', data).then((r) => r.data),
  updateRole: (id, data) => httpClient.patch(`/roles/${id}`, data).then((r) => r.data),
  deleteRole: (id) => httpClient.delete(`/roles/${id}`).then((r) => r.data),

  // Role ↔ permissions matrix
  getPermissionsMatrix: () => httpClient.get('/roles/permissions-matrix').then((r) => r.data),
  updateRolePermissions: (id, actions) =>
    httpClient.put(`/roles/${id}/permissions`, { actions }).then((r) => r.data),

  // Permission actions (action catalogue)
  listActions: () => httpClient.get('/roles/actions').then((r) => r.data),
  createAction: (data) => httpClient.post('/roles/actions', data).then((r) => r.data),
  updateAction: (name, data) => httpClient.patch(`/roles/actions/${name}`, data).then((r) => r.data),
}
