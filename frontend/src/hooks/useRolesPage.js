import { useCallback, useMemo, useState } from "react";
import { Form, Modal } from "antd";
import { useFeedback } from "./useFeedback";
import { PERMISSIONS } from "../constants/permissions";
import { useDeleteRole, usePermissionActions, useRolePermissionsMatrix, useRoles, useSavePermissionAction, useSaveRole, useToggleRolePermission, useUpdateRolePermissions } from "./useRoles";
export const useRolesPage = ({
  currentUser,
  onPermissionsChanged
}) => {
  const message = useFeedback();
  // ─── State ────────────────────────────────────────────────────────────────
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [editingAction, setEditingAction] = useState(null);
  const [roleForm] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [permDrawerOpen, setPermDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedActions, setSelectedActions] = useState([]);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const rolesQuery = useRoles();
  const actionsQuery = usePermissionActions();
  const roles = rolesQuery.roles;
  const actions = actionsQuery.actions;
  const activeActions = useMemo(() => actions.filter(action => action.isActive), [actions]);

  // Group actions by group_name for the matrix header
  const actionGroups = useMemo(() => {
    const groups = {};
    activeActions.forEach(action => {
      if (!groups[action.groupName]) groups[action.groupName] = [];
      groups[action.groupName].push(action);
    });
    return groups;
  }, [activeActions]);
  const rolePermissionsQuery = useRolePermissionsMatrix();
  const allRolePermissions = rolePermissionsQuery.matrix;

  // ─── Mutations ────────────────────────────────────────────────────────────
  const saveRoleMutation = useSaveRole({
    roleId: editingRole?.id,
    onSuccess: () => {
      setRoleModalOpen(false);
      setEditingRole(null);
      roleForm.resetFields();
      if (onPermissionsChanged) onPermissionsChanged();
      message.success(editingRole ? 'Đã cập nhật vai trò' : 'Đã tạo vai trò mới');
    },
    onError: err => message.error(err.response?.data?.message || 'Không lưu được vai trò')
  });
  const deleteRoleMutation = useDeleteRole({
    onSuccess: () => {
      if (onPermissionsChanged) onPermissionsChanged();
      message.success('Đã tắt vai trò');
    },
    onError: err => message.error(err.response?.data?.message || 'Không xóa được vai trò')
  });
  const togglePermissionMutation = useToggleRolePermission({
    onSuccess: () => {
      if (onPermissionsChanged) onPermissionsChanged();
    },
    onError: err => message.error(err.response?.data?.message || 'Không cập nhật được quyền')
  });
  const savePermissionsMutation = useUpdateRolePermissions({
    onSuccess: () => {
      if (onPermissionsChanged) onPermissionsChanged();
      setPermDrawerOpen(false);
      message.success('Đã cập nhật danh sách quyền');
    },
    onError: err => message.error(err.response?.data?.message || 'Không cập nhật được quyền')
  });
  const saveActionMutation = useSavePermissionAction({
    actionName: editingAction?.name,
    onSuccess: () => {
      setActionModalOpen(false);
      setEditingAction(null);
      actionForm.resetFields();
      if (onPermissionsChanged) onPermissionsChanged();
      message.success(editingAction ? 'Đã cập nhật action' : 'Đã tạo action mới');
    },
    onError: err => message.error(err.response?.data?.message || 'Không lưu được action')
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const openCreateRole = () => {
    setEditingRole(null);
    roleForm.resetFields();
    roleForm.setFieldsValue({
      level: 10
    });
    setRoleModalOpen(true);
  };
  const openEditRole = role => {
    setEditingRole(role);
    roleForm.setFieldsValue({
      label: role.label,
      level: role.level
    });
    setRoleModalOpen(true);
  };
  const openCreateAction = () => {
    setEditingAction(null);
    actionForm.resetFields();
    actionForm.setFieldsValue({
      sortOrder: 99,
      groupName: 'department'
    });
    setActionModalOpen(true);
  };
  const openEditAction = action => {
    setEditingAction(action);
    actionForm.setFieldsValue({
      label: action.label,
      groupName: action.groupName,
      description: action.description,
      sortOrder: action.sortOrder
    });
    setActionModalOpen(true);
  };
  const handleTogglePermission = useCallback((roleId, actionName, checked) => {
    const currentActions = allRolePermissions[roleId] || [];
    const isEditingOwnRole = currentUser?.roleAssignments?.some(assignment => assignment.isActive && assignment.roleId === roleId);
    if (!checked && actionName === PERMISSIONS.SYSTEM_MANAGE && isEditingOwnRole) {
      Modal.confirm({
        title: 'Gỡ quyền quản trị hệ thống?',
        content: 'Tài khoản hiện tại có thể mất quyền mở màn Vai trò & Quyền sau khi lưu.',
        okText: 'Vẫn gỡ',
        cancelText: 'Hủy',
        onOk: () => togglePermissionMutation.mutate({
          roleId,
          action: actionName,
          checked,
          currentActions
        })
      });
      return;
    }
    togglePermissionMutation.mutate({
      roleId,
      action: actionName,
      checked,
      currentActions
    });
  }, [allRolePermissions, currentUser?.roleAssignments, togglePermissionMutation]);
  const handleBulkUpdatePermissions = useCallback((roleId, nextActions) => {
    const currentActions = allRolePermissions[roleId] || [];
    const isEditingOwnRole = currentUser?.roleAssignments?.some(assignment => assignment.isActive && assignment.roleId === roleId);
    const hadSystemManage = currentActions.includes(PERMISSIONS.SYSTEM_MANAGE);
    const hasSystemManage = nextActions.includes(PERMISSIONS.SYSTEM_MANAGE);
    if (hadSystemManage && !hasSystemManage && isEditingOwnRole) {
      Modal.confirm({
        title: 'Gỡ quyền quản trị hệ thống?',
        content: 'Tài khoản hiện tại có thể mất quyền mở màn Vai trò & Quyền sau khi lưu.',
        okText: 'Vẫn gỡ',
        cancelText: 'Hủy',
        onOk: () => savePermissionsMutation.mutate({
          roleId,
          actions: nextActions
        })
      });
      return;
    }
    savePermissionsMutation.mutate({
      roleId,
      actions: nextActions
    });
  }, [allRolePermissions, currentUser?.roleAssignments, savePermissionsMutation]);
  const openPermissionsDrawer = useCallback(role => {
    setSelectedRole(role);
    setSelectedActions(allRolePermissions[role.id] || []);
    setPermDrawerOpen(true);
  }, [allRolePermissions]);

  // ─── Permission grouped list ──────────────────────────────────────────────

  const pageError = rolesQuery.error || actionsQuery.error || rolePermissionsQuery.error;
  const isLoading = rolesQuery.isLoading || actionsQuery.isLoading || rolePermissionsQuery.isLoading;

  // ─── Render ───────────────────────────────────────────────────────────────

  return {
    isLoading,
    pageError,
    rolesQuery,
    actionsQuery,
    rolePermissionsQuery,
    openCreateRole,
    roles: {
      roles,
      allRolePermissions,
      openPermissionsDrawer,
      openEditRole,
      deleteRoleMutation
    },
    matrix: {
      actionGroups,
      roles,
      allRolePermissions,
      togglePermissionMutation,
      handleTogglePermission
    },
    actions: {
      openCreateAction,
      actions,
      openEditAction
    },
    roleEditor: {
      editingRole,
      roleModalOpen,
      setRoleModalOpen,
      setEditingRole,
      roleForm,
      saveRoleMutation
    },
    actionEditor: {
      editingAction,
      actionModalOpen,
      setActionModalOpen,
      setEditingAction,
      actionForm,
      saveActionMutation
    },
    permissions: {
      selectedRole,
      setPermDrawerOpen,
      permDrawerOpen,
      savePermissionsMutation,
      handleBulkUpdatePermissions,
      selectedActions,
      setSelectedActions,
      actions,
      activeActions,
      actionGroups
    }
  };
};
