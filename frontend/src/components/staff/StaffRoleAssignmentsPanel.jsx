import { QueryErrorState } from "../common/QueryErrorState";
import { Alert, Button, Form, Popconfirm, Select, Space, Table, Tag } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";

export const StaffRoleAssignmentsPanel = ({
  assignmentForm,
  saveAssignmentMutation,
  rolesQuery,
  roleOptionsForAssignments,
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
  allowedScopes = [],
  assignmentDepartmentOptions = [],
  canAssignRoles = false,
  canManageAssignment = () => false,
  optionsQuery,
}) => <Space orientation="vertical" size="middle" style={{
  width: "100%"
}}>
                  {!canAssignRoles && !optionsQuery?.isPending ? <Alert type="info" showIcon title="Bạn không được thay đổi vai trò của chính mình. Nhờ quản trị hệ thống hỗ trợ." /> : null}
                  {canAssignRoles ? <Form form={assignmentForm} layout="vertical" initialValues={{
    scopeType: "department",
    isActive: true
  }} onFinish={values => saveAssignmentMutation.mutate(values)}>
                    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: "0 12px",
      alignItems: "end"
    }}>
                      <Form.Item name="roleId" label="Vai trò" rules={[{
        required: true,
        message: "Chọn vai trò"
      }]}>
                        <Select aria-label="Vai trò" loading={optionsQuery?.isFetching || rolesQuery.isLoading} showSearch optionFilterProp="label" options={roleOptionsForAssignments} />
                      </Form.Item>
                      <Form.Item name="scopeType" label="Phạm vi" rules={[{
        required: true
      }]}>
                        <Select aria-label="Phạm vi" options={allowedScopes} onChange={() => { assignmentForm.setFieldValue("departmentId", undefined); assignmentForm.setFieldValue("departmentIds", []); }} />
                      </Form.Item>
                      {assignmentScopeType === "system" ? <Form.Item label="Đơn vị">
                          <Select disabled placeholder="Không cần chọn đơn vị" />
                        </Form.Item> : assignmentScopeType === "specific_departments" ? <Form.Item name="departmentIds" label="Đơn vị" rules={[{
        required: true,
        message: "Chọn đơn vị"
      }]}>
                          <Select mode="multiple" showSearch optionFilterProp="label" options={assignmentDepartmentOptions} />
                        </Form.Item> : <Form.Item name="departmentId" label="Đơn vị" rules={[{
        required: true,
        message: "Chọn đơn vị"
      }]}>
                          <Select showSearch optionFilterProp="label" options={assignmentDepartmentOptions} />
                        </Form.Item>}
                      <Form.Item>
                        <Button type="primary" htmlType="submit" icon={editingAssignment ? <EditOutlined /> : <PlusOutlined />} loading={saveAssignmentMutation.isPending} disabled={optionsQuery?.isFetching || optionsQuery?.isError}>
                          {editingAssignment ? "Lưu" : "Gán"}
                        </Button>
                      </Form.Item>
                    </div>
                    {editingAssignment ? <Button size="small" onClick={cancelEditAssignment}>
                        Hủy sửa
                      </Button> : null}
                  </Form> : null}
                  {roleAssignmentsQuery.isError ? <QueryErrorState error={roleAssignmentsQuery.error} onRetry={() => roleAssignmentsQuery.refetch()} retrying={roleAssignmentsQuery.isFetching} /> : <Table rowKey="id" size="small" loading={roleAssignmentsQuery.isLoading} dataSource={roleAssignments} pagination={false} columns={[{
    title: "Vai trò",
    dataIndex: "roleName",
    render: (value, assignment) => <Tag color={assignment.isActive ? "blue" : "default"}>
                            {assignment.roleLabel || roleLabelByName.get(value || roleById.get(assignment.roleId)?.name) || value}
                          </Tag>
  }, {
    title: "Phạm vi",
    dataIndex: "scopeType",
    render: (_, assignment) => formatScope(assignment)
  }, {
    title: "Trạng thái",
    dataIndex: "isActive",
    width: 120,
    render: value => <Tag color={value ? "green" : "default"}>
                            {value ? "Hoạt động" : "Tắt"}
                          </Tag>
  }, {
    title: "",
    width: 120,
    render: (_, assignment) => <Space>
                            <Button size="small" aria-label="Sửa vai trò được gán" disabled={!canManageAssignment(assignment)} icon={<EditOutlined />} onClick={() => openEditAssignment(assignment)} />
                            {assignment.isActive ? <Popconfirm title="Tắt vai trò này?" okText="Tắt" cancelText="Hủy" onConfirm={() => disableAssignmentMutation.mutate(assignment.id)}>
                                <Button size="small" aria-label="Tắt vai trò được gán" disabled={!canManageAssignment(assignment)} icon={<DeleteOutlined />} />
                              </Popconfirm> : null}
                          </Space>
  }]} />}
                </Space>;
