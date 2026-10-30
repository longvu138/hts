import { StaffProfileForm } from "./StaffProfileForm";
import { StaffRoleAssignmentsPanel } from "./StaffRoleAssignmentsPanel";
import { QueryErrorState } from "../common/QueryErrorState";
import { Alert, Modal, Tabs } from "antd";

export const StaffAccountModal = ({
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
  disableAssignmentMutation,
  optionsQuery, allowedScopes, initialDepartmentOptions, assignmentDepartmentOptions, canAssignRoles, canManageAssignment,
}) => <Modal title={editing ? "Sửa tài khoản" : "Thêm tài khoản"} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okText={editing ? "Lưu" : "Tạo tài khoản"} cancelText="Hủy bỏ" confirmLoading={saveMutation.isPending} okButtonProps={{
  disabled: activeModalTab !== "profile" || assignInitialRole && (optionsQuery?.isPending || optionsQuery?.isFetching || optionsQuery?.isError)
}} centered width={700}>
        {departmentsQuery.isError || rolesQuery.isError ? <QueryErrorState error={departmentsQuery.error || rolesQuery.error} onRetry={() => {
    departmentsQuery.refetch();
    rolesQuery.refetch();
  }} /> : null}
        {optionsQuery?.isError ? <QueryErrorState title="Không tải được lựa chọn phân quyền" error={optionsQuery.error} onRetry={optionsQuery.refetch} retrying={optionsQuery.isFetching} /> : null}
        {optionsQuery?.data?.truncated ? <Alert type="warning" showIcon title="Danh mục có hơn 500 lựa chọn; đang hiển thị 500 lựa chọn đầu tiên." style={{ marginBottom: 12 }} /> : null}
        <Tabs activeKey={activeModalTab} onChange={setActiveModalTab} items={[{
    key: "profile",
    label: "Thông tin",
    children: <StaffProfileForm optionsQuery={optionsQuery} allowedScopes={allowedScopes} initialDepartmentOptions={initialDepartmentOptions} form={form} handleSaveStaff={handleSaveStaff} departmentOptions={departmentOptions} editing={editing} assignInitialRole={assignInitialRole} rolesQuery={rolesQuery} roleOptionsForAssignments={roleOptionsForAssignments} initialRoleScopeType={initialRoleScopeType} />
  }, {
    key: "assignments",
    label: "Vai trò & phạm vi",
    disabled: !editing,
    children: <StaffRoleAssignmentsPanel optionsQuery={optionsQuery} allowedScopes={allowedScopes} assignmentDepartmentOptions={assignmentDepartmentOptions} canAssignRoles={canAssignRoles} canManageAssignment={canManageAssignment} assignmentForm={assignmentForm} saveAssignmentMutation={saveAssignmentMutation} rolesQuery={rolesQuery} roleOptionsForAssignments={roleOptionsForAssignments} assignmentScopeType={assignmentScopeType} departmentOptions={departmentOptions} editingAssignment={editingAssignment} cancelEditAssignment={cancelEditAssignment} roleAssignmentsQuery={roleAssignmentsQuery} roleAssignments={roleAssignments} roleLabelByName={roleLabelByName} roleById={roleById} formatScope={formatScope} openEditAssignment={openEditAssignment} disableAssignmentMutation={disableAssignmentMutation} />
  }]} />
      </Modal>;
