import { Form, Input, InputNumber, Modal } from "antd";

export const RoleEditorModal = ({
  editingRole,
  roleModalOpen,
  setRoleModalOpen,
  setEditingRole,
  roleForm,
  saveRoleMutation
}) => {
  return <Modal title={editingRole ? 'Sửa vai trò' : 'Thêm vai trò mới'} open={roleModalOpen} onCancel={() => {
    setRoleModalOpen(false);
    setEditingRole(null);
  }} onOk={() => roleForm.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={saveRoleMutation.isPending} centered width={460}>
        <Form form={roleForm} layout="vertical" onFinish={values => saveRoleMutation.mutate(values)}>
          {!editingRole && <Form.Item name="name" label="Tên key (không dấu, gạch dưới)" rules={[{
        required: true,
        message: 'Nhập tên key'
      }, {
        pattern: /^[a-z0-9_]+$/,
        message: 'Chỉ chữ thường, số và gạch dưới'
      }]} extra="Ví dụ: tro_ly_cvp, phong_admin (không thể thay đổi sau khi tạo)">
              <Input placeholder="vd: tro_ly_cvp" />
            </Form.Item>}
          <Form.Item name="label" label="Tên hiển thị" rules={[{
        required: true,
        message: 'Nhập tên hiển thị'
      }]} extra="Ví dụ: Trợ lý chánh văn phòng, Admin phòng">
            <Input placeholder="vd: Trợ lý chánh văn phòng" />
          </Form.Item>
          <Form.Item name="level" label="Thứ tự ưu tiên hiển thị" rules={[{
        required: true
      }]} extra="Số lớn hơn hiển thị trước. Quyền sử dụng do các quyền thao tác và phạm vi được gán quyết định.">
            <InputNumber min={1} max={99} style={{
          width: '100%'
        }} />
          </Form.Item>
        </Form>
      </Modal>;
};
