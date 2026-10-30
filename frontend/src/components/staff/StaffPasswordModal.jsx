import { useState } from "react";
import { Button, Form, Input, Modal } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { Typography } from "antd";
import { PASSWORD_RULES } from "../../constants/password";
import { generateStrongPassword, passwordPolicyRule } from "../../utils/passwordPolicy";
import { useFeedback } from "../../hooks/useFeedback";

const {
  Text
} = Typography;

export const StaffPasswordModal = ({
  resetTarget,
  setResetTarget,
  resetForm,
  resetPasswordMutation
}) => {
  const message = useFeedback();
  const [generated, setGenerated] = useState("");
  const password = Form.useWatch("password", resetForm);
  const showGenerated = Boolean(generated) && password === generated;

  const handleGenerate = () => {
    try {
      const value = generateStrongPassword({ username: resetTarget?.username });
      resetForm.setFieldsValue({ password: value, confirmPassword: value });
      resetForm.validateFields(["password", "confirmPassword"]).catch(() => {});
      setGenerated(value);
    } catch {
      message.error("Trình duyệt không hỗ trợ tạo mật khẩu ngẫu nhiên. Vui lòng nhập thủ công.");
    }
  };

  return <Modal title={`Đặt lại mật khẩu${resetTarget ? ` - ${resetTarget.fullName || resetTarget.username || ""}` : ""}`} open={Boolean(resetTarget)} onCancel={() => setResetTarget(null)} afterClose={() => setGenerated("")} onOk={() => resetForm.submit()} confirmLoading={resetPasswordMutation.isPending} okText="Đồng ý" cancelText="Hủy bỏ" centered>
        <Form form={resetForm} layout="vertical" onFinish={values => resetTarget?.id && resetPasswordMutation.mutate({
      userId: resetTarget.id,
      values
    })}>
          <Form.Item label="Mật khẩu tạm" htmlFor="password" required extra={PASSWORD_RULES.filter(rule => rule.text).map(rule => rule.text).join(" · ")}>
            <div className="password-input-with-action">
              <Form.Item name="password" noStyle rules={[{
            required: true,
            message: "Nhập mật khẩu tạm"
          }, passwordPolicyRule(() => resetTarget?.username)]}>
                <Input.Password autoComplete="new-password"/>
              </Form.Item>
              <Button icon={<ThunderboltOutlined />} onClick={handleGenerate}>
                Tạo ngẫu nhiên
              </Button>
            </div>
          </Form.Item>
          {showGenerated ? <div className="password-generated" aria-live="polite">
              <Text type="secondary">Mật khẩu đã tạo:</Text>
              <Text code copyable={{
          text: generated,
          tooltips: ["Sao chép", "Đã sao chép"]
        }}>{generated}</Text>
            </div> : null}
          <Form.Item name="confirmPassword" label="Nhập lại mật khẩu tạm" dependencies={["password"]} rules={[{
        required: true,
        message: "Nhập lại mật khẩu tạm"
      }, ({
        getFieldValue
      }) => ({
        validator(_, value) {
          if (!value || getFieldValue("password") === value) {
            return Promise.resolve();
          }
          return Promise.reject(new Error("Mật khẩu xác nhận không khớp"));
        }
      })]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Text type="secondary">
            Sau khi reset, người dùng phải đổi mật khẩu ở lần đăng nhập tiếp
            theo.
          </Text>
        </Form>
      </Modal>;
};
