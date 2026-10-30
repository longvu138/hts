/**
 * Frontend permission helpers.
 * Permissions are now sourced from the server (currentUser.permissions array returned by /auth/me).
 * LEGACY_ROLE_PERMISSIONS has been removed — the source of truth is the role_permissions DB table.
 */
import { PERMISSIONS } from "../constants/permissions.js";

const getUserPermissions = (currentUser) => {
  // Authoritative: permissions array from API response
  const fromApi = Array.isArray(currentUser?.permissions) ? currentUser.permissions : []
  return [...new Set(fromApi)]
}

export const hasPermission = (currentUser, action) => {
  if (!currentUser || !action) return false
  const permissions = getUserPermissions(currentUser)
  return permissions.includes(PERMISSIONS.SYSTEM_MANAGE) || permissions.includes(action)
}
