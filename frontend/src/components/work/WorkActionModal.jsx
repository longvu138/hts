import { Alert, Button, Form, Input, Modal, Typography } from "antd";
import { useFeedback } from "../../hooks/useFeedback";
import { useWorkMutation } from "../../hooks/useWork";
import { isWorkVersionConflict, workErrorMessage } from "../../utils/workErrors";
import { workPartTitle } from "../../utils/workParts";
import { errorScrollOptions } from "../../utils/workForm";

const COPY = {
  info: { title: "Sửa thông tin công việc", ok: "Lưu thông tin", done: "Đã cập nhật thông tin chung" },
  cancel: { title: "Hủy việc", ok: "Xác nhận hủy", done: "Đã hủy việc" },
  complete: { title: "Hoàn thành việc", ok: "Xác nhận hoàn thành", done: "Đã hoàn thành việc" },
};

export const WorkActionModal = ({ action, item, onClose }) => {
  const [form] = Form.useForm();
  const feedback = useFeedback();
  const mutation = useWorkMutation();
  const cancel = action === "cancel";
  const info = action === "info";
  const copy = COPY[action] || COPY.complete;

  const submit = async () => {
    try {
      const values = await form.validateFields();
      await mutation.mutateAsync({ action, id: info ? item.workId : item.id, body: { ...values, version: item.version } });
      feedback.success(copy.done);
      onClose();
    } catch (error) {
      const field = error?.errorFields?.[0]?.name;
      if (field) form.scrollToField(field, errorScrollOptions());
    }
  };

  return (
    <Modal
      centered
      open
      className="work-modal"
      rootClassName="work-modal-root"
      title={copy.title}
      onCancel={() => !mutation.isPending && onClose()}
      onOk={submit}
      okText={copy.ok}
      cancelText="Đóng"
      confirmLoading={mutation.isPending}
      okButtonProps={{ danger: cancel, disabled: mutation.isPending }}
      mask={{ closable: false }}
    >
      {!info ? <Typography.Paragraph strong>{workPartTitle(item)}</Typography.Paragraph> : null}
      {cancel ? (
        <Alert
          showIcon
          type="warning"
          title="Các phần chưa hoàn thành trong nhánh này sẽ bị hủy. Lịch sử hoàn thành vẫn được giữ."
          style={{ marginBottom: 16 }}
        />
      ) : null}
      {isWorkVersionConflict(mutation.error) ? <Button onClick={onClose} style={{ marginBottom: 12 }}>Đóng và tải lại công việc</Button> : null}
      {mutation.isError ? <Alert role="alert" showIcon type="error" title={workErrorMessage(mutation.error)} style={{ marginBottom: 16 }} /> : null}
      <Form form={form} layout="vertical" initialValues={info ? { title: item.title, description: item.description } : {}}>
        {info ? (
          <>
            <Alert
              type="info"
              showIcon
              title="Tên chung của công việc; tên riêng của từng người được giữ nguyên."
              style={{ marginBottom: 12 }}
            />
            <Form.Item
              name="title"
              label="Tên công việc chung"
              rules={[{ required: true, whitespace: true, message: "Vui lòng nhập tên công việc" }, { max: 200 }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="description" label="Mô tả thêm" rules={[{ max: 5000 }]}>
              <Input.TextArea maxLength={5000} />
            </Form.Item>
          </>
        ) : (
          <Form.Item
            name={cancel ? "reason" : "note"}
            label={cancel ? "Lý do hủy" : "Ghi chú (không bắt buộc)"}
            rules={cancel ? [{ required: true, whitespace: true, message: "Vui lòng nhập lý do hủy" }, { max: 1000 }] : [{ max: 1000 }]}
          >
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={1000} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};
