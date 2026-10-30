import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Form } from "antd";
import { useFeedback } from "./useFeedback";
import { useMediaQuery } from "./useMediaQuery";
import { useUrlPagination } from "./useUrlPagination";
import { useDepartments } from "./useDepartments";
import { useAssignmentOptions, useDisableStaffRoleAssignment, useResetStaffPassword, useRevokeAllUserSessions, useRevokeUserSession, useSaveStaffMember, useSaveStaffRoleAssignment, useStaffMembers, useStaffRoleAssignments, useStaffRoles, useUserSessions } from "./useStaffMembers";
import { PERMISSIONS } from "../constants/permissions";
import { hasPermission } from "../utils/permissions";
export const useStaffMembersPage = ({
  currentUser,
  onCurrentUserRefresh
}) => {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [open, setOpen] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState("profile");
  const [resetTarget, setResetTarget] = useState(null);
  const [sessionsTarget, setSessionsTarget] = useState(null);
  const [showInactiveSessions, setShowInactiveSessions] = useState(false);
  const [form] = Form.useForm();
  const [assignmentForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const assignInitialRole = Form.useWatch("assignInitialRole", form);
  const initialRoleScopeType = Form.useWatch(["initialRoleAssignment", "scopeType"], form);
  const message = useFeedback();
  const canWrite = hasPermission(currentUser, PERMISSIONS.STAFF_MANAGE);
  // Dưới 1200px dùng card (theo checklist UI); đọc đồng bộ để không render bảng rồi đổi sang card.
  const useCardList = useMediaQuery("(max-width: 1199.98px)");
  const didMountRef = useRef(false);
  const {
    page,
    pageSize,
    setPage,
    setPagination
  } = useUrlPagination({
    pageParam: "staffPage",
    pageSizeParam: "staffPageSize"
  });
  const deferredQuery = useDeferredValue(query.trim());
  const staffQuery = useStaffMembers({
    q: deferredQuery || undefined,
    page,
    limit: pageSize
  });
  const departmentsQuery = useDepartments();
  const rolesQuery = useStaffRoles();
  const optionsQuery = useAssignmentOptions(canWrite && open);
  const scopeOptions = useMemo(() => Array.isArray(optionsQuery.data?.scopes) ? optionsQuery.data.scopes : [], [optionsQuery.data]);
  const grantedDepartments = Array.isArray(optionsQuery.data?.departments) ? optionsQuery.data.departments : [];
  const grantDepartmentOptions = scope => {
    const ids = new Set(scopeOptions.find(option => option.value === scope)?.departmentIds || []);
    return grantedDepartments.filter(d => ids.has(d.id)).map(d => ({ value: d.id, label: d.name }));
  };
  useEffect(() => {
    if (!open || editing || !optionsQuery.isSuccess || hasPermission(currentUser, PERMISSIONS.SYSTEM_MANAGE)) return;
    const available = Array.isArray(optionsQuery.data?.departments) ? optionsQuery.data.departments : [];
    const defaultId = available.length === 1 ? available[0].id : available.find(d => d.id === currentUser?.departmentId)?.id;
    if (!defaultId) return;
    if (!form.getFieldValue("departmentId")) form.setFieldValue("departmentId", defaultId);
    const assignment = form.getFieldValue("initialRoleAssignment") || {};
    if (assignment.scopeType === "department" && !assignment.departmentId) {
      form.setFieldValue(["initialRoleAssignment", "departmentId"], defaultId);
    }
  }, [open, editing, optionsQuery.isSuccess, optionsQuery.data, currentUser, form]);
  const canAssignRoles = canWrite && (!editing || editing.id !== currentUser.id || optionsQuery.data?.canAssignToSelf);

  const roleAssignmentsQuery = useStaffRoleAssignments(editing?.id, {
    enabled: Boolean(editing?.id && open)
  });
  useEffect(() => {
    if (!open || !optionsQuery.isSuccess || !scopeOptions.length) return;
    for (const [targetForm, prefix] of [[form, ['initialRoleAssignment']], [assignmentForm, []]]) {
      const path = [...prefix, 'scopeType'];
      if (!scopeOptions.some(scope => scope.value === targetForm.getFieldValue(path))) targetForm.setFieldValue(path, scopeOptions[0].value);
    }
  }, [open, optionsQuery.isSuccess, scopeOptions, form, assignmentForm]);
  const sessionsQuery = useUserSessions(sessionsTarget?.id);
  const sessionRows = useMemo(() => sessionsQuery.sessions, [sessionsQuery.sessions]);
  const activeSessionCount = sessionRows.filter(session => session.active).length;
  const visibleSessionRows = showInactiveSessions ? sessionRows : sessionRows.filter(session => session.active);
  const managingOwnSessions = sessionsTarget?.id === currentUser?.id;
  const departments = useMemo(() => departmentsQuery.departments, [departmentsQuery.departments]);
  const departmentMap = new Map(departments.map(department => [department.id, department.name]));
  const isAdmin = hasPermission(currentUser, PERMISSIONS.SYSTEM_MANAGE);
  const departmentOptions = (isAdmin ? departments : grantedDepartments).map(department => ({
    value: department.id,
    label: department.name
  }));
  const roles = useMemo(() => rolesQuery.roles, [rolesQuery.roles]);
  const roleLabelByName = new Map(roles.map(role => [role.name, role.label || role.name]));
  const roleOptionsForAssignments = (Array.isArray(optionsQuery.data?.roles) ? optionsQuery.data.roles : []).map(role => ({
    value: role.id,
    label: role.label || role.name
  }));
  const canManageAssignment = assignment => canAssignRoles && (optionsQuery.data?.canAssignToSelf || (
    roleOptionsForAssignments.some(role => role.value === assignment.roleId) && scopeOptions.some(scope => scope.value === assignment.scopeType && (scope.value === 'system' || (assignment.scopeType === 'specific_departments' ? assignment.departmentIds || [] : [assignment.departmentId]).every(id => scope.departmentIds.includes(id))))
  ));
  const roleById = new Map(roles.map(role => [role.id, role]));
  const staff = staffQuery.staffMembers;
  const staffPagination = staffQuery.pagination;
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
  }, [deferredQuery, setPage]);
  const saveMutation = useSaveStaffMember({
    staffMemberId: editing?.id,
    onSuccess: () => {
      if (editing?.id === currentUser?.id && onCurrentUserRefresh) onCurrentUserRefresh();
      setOpen(false);
      setEditing(null);
      form.resetFields();
      message.success("Đã lưu tài khoản");
    },
    onError: error => message.error(error.response?.data?.message || "Không lưu được tài khoản")
  });
  const handleSaveStaff = values => {
    const {
      assignInitialRole: shouldAssignRole,
      initialRoleAssignment,
      ...staffPayload
    } = values;
    // Mã cán bộ là trường ẩn: khi sửa hồ sơ cũ chưa có mã thì không gửi giá trị rỗng.
    if (editing && !String(staffPayload.code ?? "").trim()) delete staffPayload.code;
    if (!editing && shouldAssignRole && initialRoleAssignment?.roleId) {
      staffPayload.roleAssignments = [{
        ...initialRoleAssignment,
        isActive: true
      }];
    }
    if (shouldAssignRole && (optionsQuery.isPending || optionsQuery.isFetching || optionsQuery.isError)) { message.warning('Vui lòng tải xong lựa chọn phân quyền trước khi lưu'); return; }
    saveMutation.mutate(staffPayload);
  };
  const resetPasswordMutation = useResetStaffPassword({
    onSuccess: () => {
      setResetTarget(null);
      resetForm.resetFields();
      message.success("Đã reset mật khẩu");
    },
    onError: error => message.error(error.response?.data?.message || "Không reset được mật khẩu")
  });
  const revokeSessionMutation = useRevokeUserSession({
    userId: sessionsTarget?.id,
    onSuccess: () => {
      message.success("Đã thu hồi phiên đăng nhập");
    },
    onError: error => message.error(error.response?.data?.message || "Không thu hồi được phiên")
  });
  const revokeAllSessionsMutation = useRevokeAllUserSessions({
    userId: sessionsTarget?.id,
    exceptCurrent: managingOwnSessions,
    onSuccess: () => {
      message.success(managingOwnSessions ? "Đã thu hồi tất cả phiên khác" : "Đã thu hồi tất cả phiên đăng nhập");
    },
    onError: error => message.error(error.response?.data?.message || "Không thu hồi được các phiên")
  });
  const saveAssignmentMutation = useSaveStaffRoleAssignment({
    staffMemberId: editing?.id,
    assignmentId: editingAssignment?.id,
    onSuccess: () => {
      if (editing?.id === currentUser?.id && onCurrentUserRefresh) onCurrentUserRefresh();
      setEditingAssignment(null);
      assignmentForm.resetFields();
      assignmentForm.setFieldsValue({
        scopeType: "department",
        isActive: true
      });
      message.success(editingAssignment ? "Đã cập nhật vai trò" : "Đã gán vai trò");
    },
    onError: error => message.error(error.response?.data?.message || "Không lưu được vai trò")
  });
  const disableAssignmentMutation = useDisableStaffRoleAssignment({
    staffMemberId: editing?.id,
    onSuccess: () => {
      if (editing?.id === currentUser?.id && onCurrentUserRefresh) onCurrentUserRefresh();
      message.success("Đã tắt vai trò");
    },
    onError: error => message.error(error.response?.data?.message || "Không tắt được vai trò")
  });
  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    const nextCode = `CB-${String(Date.now()).slice(-8)}`;
    form.setFieldsValue({
      code: nextCode,
      isActive: true,
      // Mặc định chỉ tạo hồ sơ; bật "Gán vai trò ngay" khi muốn cấp quyền luôn.
      assignInitialRole: false,
      initialRoleAssignment: {
        scopeType: "department",
        isActive: true
      }
    });
    assignmentForm.resetFields();
    setEditingAssignment(null);
    setActiveModalTab("profile");
    setOpen(true);
  };
  const openEdit = record => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      ...record,
      assignInitialRole: false,
      initialRoleAssignment: undefined
    });
    assignmentForm.resetFields();
    assignmentForm.setFieldsValue({
      scopeType: "department",
      isActive: true
    });
    setEditingAssignment(null);
    setActiveModalTab("profile");
    setOpen(true);
  };
  const openEditAssignment = assignment => {
    setEditingAssignment(assignment);
    assignmentForm.setFieldsValue({
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      departmentId: assignment.departmentId,
      departmentIds: assignment.departmentIds || [],
      isActive: assignment.isActive
    });
  };
  const cancelEditAssignment = () => {
    setEditingAssignment(null);
    assignmentForm.resetFields();
    assignmentForm.setFieldsValue({
      scopeType: "department",
      isActive: true
    });
  };
  const openResetPassword = record => {
    setResetTarget(record);
    resetForm.resetFields();
  };
  const openSessions = record => {
    setShowInactiveSessions(false);
    setSessionsTarget(record);
  };
  const assignmentScopeType = Form.useWatch("scopeType", assignmentForm);
  const roleAssignments = useMemo(() => Array.isArray(roleAssignmentsQuery.assignments) ? roleAssignmentsQuery.assignments : editing?.roleAssignments || [], [editing?.roleAssignments, roleAssignmentsQuery.assignments]);
  const formatScope = assignment => {
    if (assignment.scopeType === "system") return "Toàn hệ thống";
    if (assignment.scopeType === "department") return departmentMap.get(assignment.departmentId) || "-";
    if (assignment.scopeType === "department_tree") return `${departmentMap.get(assignment.departmentId) || "-"} và cấp dưới`;
    if (assignment.scopeType === "specific_departments") {
      return assignment.departmentIds?.map(id => departmentMap.get(id) || id).join(", ") || "-";
    }
    return assignment.scopeType;
  };
  return {
    list: {
      query,
      setQuery,
      canWrite,
      openCreate,
      staffQuery,
      useCardList,
      staff,
      page,
      pageSize,
      staffPagination,
      setPagination,
      openEdit,
      departmentMap,
      roleLabelByName,
      roleById,
      openResetPassword,
      openSessions
    },
    account: {
      editing,
      open,
      setOpen,
      form,
      saveMutation,
      activeModalTab,
      departmentsQuery,
      rolesQuery,
      setActiveModalTab,
      handleSaveStaff,
      departmentOptions,
      assignInitialRole,
      roleOptionsForAssignments,
      initialRoleScopeType,
      optionsQuery,
      allowedScopes: scopeOptions,
      initialDepartmentOptions: grantDepartmentOptions(initialRoleScopeType),
      assignmentDepartmentOptions: grantDepartmentOptions(assignmentScopeType),
      canAssignRoles,
      canManageAssignment,
      assignmentForm,
      saveAssignmentMutation,
      assignmentScopeType,
      editingAssignment,
      cancelEditAssignment,
      roleAssignmentsQuery,
      roleAssignments,
      roleLabelByName,
      roleById,
      formatScope,
      openEditAssignment,
      disableAssignmentMutation
    },
    sessions: {
      sessionsTarget,
      setSessionsTarget,
      setShowInactiveSessions,
      managingOwnSessions,
      revokeAllSessionsMutation,
      activeSessionCount,
      sessionRows,
      showInactiveSessions,
      sessionsQuery,
      visibleSessionRows,
      revokeSessionMutation
    },
    password: {
      resetTarget,
      setResetTarget,
      resetForm,
      resetPasswordMutation
    }
  };
};
