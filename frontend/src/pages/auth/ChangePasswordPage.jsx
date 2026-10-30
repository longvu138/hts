import { Button, Card, Form, Input, Space, Typography } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Navigate, useNavigate } from "react-router-dom";
import { authApi } from "../../api/authApi";
import { PASSWORD_RULES } from "../../constants/password";
import { useFeedback } from "../../hooks/useFeedback";
import { getApiErrorMessage } from "../../utils/apiError";
import { getPasswordChecks, passwordPolicyRuleWithVisibleChecklist } from "../../utils/passwordPolicy";

const { Text, Title } = Typography;

const PasswordRules = ({ password = "", username }) => {
  const touched = Boolean(password);
  const checks = getPasswordChecks(password, { username });
  return (
    <div className="password-rules">
      <Text strong>Mật khẩu mới cần:</Text>
      <ul aria-label="Quy tắc mật khẩu mới">
        {PASSWORD_RULES.filter(rule => rule.text).map((rule) => {
          const passed = touched && checks[rule.key];
          const failed = touched && !checks[rule.key];
          const Icon = passed ? CheckCircleOutlined : failed ? CloseCircleOutlined : InfoCircleOutlined;
          return (
            <li
              key={rule.key}
              className={passed ? "password-rule-passed" : failed ? "password-rule-failed" : undefined}
              aria-label={`${rule.text}: ${passed ? "đạt" : failed ? "chưa đạt" : "chưa kiểm tra"}`}
            >
              <Icon aria-hidden="true" />
              <span>{rule.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export const ChangePasswordPage = ({ currentUser, onPasswordChanged, onLogout }) => {
  const [form] = Form.useForm();
  const message = useFeedback();
  const navigate = useNavigate();
  const newPassword = Form.useWatch("newPassword", form);
  const username = currentUser?.username || "";

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (values) => {
    try {
      const response = await authApi.changePassword(values);
      message.success(response?.message || "Đổi mật khẩu thành công");
      onPasswordChanged(response);
      form.resetFields();
    } catch (error) {
      message.error(getApiErrorMessage(error, "Không đổi được mật khẩu"));
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <Space orientation="vertical" size={18} className="full-width">
          <div className="auth-card-heading">
            {currentUser.mustChangePassword ? null : (
              <Button
                type="text"
                className="auth-back-button"
                icon={<ArrowLeftOutlined />}
                aria-label="Quay lại"
                onClick={() => navigate(-1)}
              />
            )}
            <Title level={4} style={{ margin: 0 }}>
              Đổi mật khẩu
            </Title>
          </div>
          <Text type="secondary">
            {currentUser.mustChangePassword
              ? "Bạn cần đổi mật khẩu trước khi tiếp tục sử dụng hệ thống."
              : "Cập nhật mật khẩu đăng nhập của bạn."}
          </Text>
          <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
            <Form.Item
              name="currentPassword"
              label="Mật khẩu hiện tại"
              rules={[{ required: true, message: "Nhập mật khẩu hiện tại" }]}
            >
              <Input.Password size="large" autoComplete="current-password" />
            </Form.Item>
            <Form.Item
              name="newPassword"
              label="Mật khẩu mới"
              extra={<PasswordRules password={newPassword} username={username} />}
              rules={[
                { required: true, message: "Nhập mật khẩu mới" },
                // Danh sách quy tắc đã báo đạt/chưa đạt nên lỗi trường không lặp lại cùng nội dung.
                passwordPolicyRuleWithVisibleChecklist(() => username),
              ]}
            >
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirmPassword"
              label="Nhập lại mật khẩu mới"
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: "Nhập lại mật khẩu mới" },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue("newPassword") === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error("Mật khẩu xác nhận không khớp"));
                  },
                }),
              ]}
            >
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
            <Space orientation="vertical" className="full-width">
              <Button type="primary" size="large" block htmlType="submit">
                Đổi mật khẩu
              </Button>
              {currentUser.mustChangePassword ? (
                <Button size="large" block onClick={onLogout}>
                  Đăng xuất
                </Button>
              ) : null}
            </Space>
          </Form>
        </Space>
      </Card>
    </div>
  );
};
