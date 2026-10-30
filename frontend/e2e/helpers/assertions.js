export const hasPermission = (user, permission) =>
  Array.isArray(user?.permissions) && (
    user.permissions.includes("system.manage") || user.permissions.includes(permission)
  );
