import { Form, Input, InputNumber, Modal } from "antd";

export const PermissionActionModal = ({
  editingAction,
  actionModalOpen,
  setActionModalOpen,
  setEditingAction,
  actionForm,
  saveActionMutation
}) => {
  return <Modal title={editingAction ? 'Sửa action' : 'Thêm action mới'} open={actionModalOpen} onCancel={() => {
    setActionModalOpen(false);
    setEditingAction(null);
  }} onOk={() => actionForm.submit()} okText="Lưu" cancelText="Hủy" confirmLoading={saveActionMutation.isPending} centered width={460}>
        <Form form={actionForm} layout="vertical" onFinish={values => saveActionMutation.mutate(values)}>
          {!editingAction && <Form.Item name="name" label="Action key" rules={[{
        required: true,
        message: 'Nhập action key'
      }, {
        pattern: /^[a-z0-9_.]+$/,
        message: 'Chỉ chữ thường, số, dấu chấm và gạch dưới'
      }]} extra="Ví dụ: staff.reset_in_dept, report.export_all">
              <Input placeholder="vd: staff.reset_in_dept" />
            </Form.Item>}
          <Form.Item name="label" label="Tên hiển thị" rules={[{
        required: true,
        message: 'Nhập tên hiển thị'
      }]}>
            <Input placeholder="vd: Reset mật khẩu trong phòng" />
          </Form.Item>
          <Form.Item name="groupName" label="Nhóm" rules={[{
        required: true,
        message: 'Chọn nhóm'
      }]}>
            <Input placeholder="department | staff | report | system" />
          </Form.Item>
          <Form.Item name="sortOrder" label="Thứ tự hiển thị">
            <InputNumber min={0} style={{
          width: '100%'
        }} />
          </Form.Item>
          <Form.Item name="description" label="Mô tả (tuỳ chọn)">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>;
};
