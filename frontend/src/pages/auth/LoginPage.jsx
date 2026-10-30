import { useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  Space,
  Typography,
} from "antd";
import { authApi } from "../../api/authApi";
import { APP_FULL_NAME } from "../../constants/app";
import { useFeedback } from "../../hooks/useFeedback";
import { getApiErrorMessage } from "../../utils/apiError";

const { Text, Title } = Typography;

export const LoginPage = ({ onAuthenticated }) => {
  const [loading, setLoading] = useState(false);
  const feedback = useFeedback();
  const message = { error: (content) => feedback.error(content, "Lỗi đăng nhập") };
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await authApi.login(values);

      if (response.user) {
        onAuthenticated(response);
      } else {
        message.error(
          response.message ||
            "Đăng nhập không thành công, máy chủ không trả về thông tin tài khoản",
        );
      }
    } catch (error) {
      message.error(getApiErrorMessage(error, "Không thực hiện được yêu cầu"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-visual-panel" />
      <div className="login-form-panel">
        <Card className="login-form-card" variant="borderless">
          <Space orientation="vertical" size={24} className="full-width">
            <div className="text-center">
              <Title level={3} style={{ margin: 0, fontWeight: 600 }}>
                ĐĂNG NHẬP
              </Title>
              <Text type="secondary" style={{ marginTop: 4, display: "block" }}>
                Đăng nhập {APP_FULL_NAME}
              </Text>
            </div>
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Form.Item
                name="username"
                label={<span style={{ fontWeight: 500 }}>Tài khoản</span>}
                rules={[{ required: true, message: "Vui lòng nhập tài khoản" }]}
              >
                <Input
                  size="large"
                  placeholder="Nhập tài khoản"
                  style={{ height: "46px", borderRadius: "6px" }}
                />
              </Form.Item>
              <Form.Item
                name="password"
                label={<span style={{ fontWeight: 500 }}>Mật khẩu</span>}
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu" }]}
              >
                <Input.Password
                  size="large"
                  placeholder="Nhập mật khẩu"
                  style={{ height: "46px", borderRadius: "6px" }}
                />
              </Form.Item>
              <Button
                type="primary"
                block
                loading={loading}
                htmlType="submit"
                style={{
                  borderRadius: "8px",
                  fontWeight: 600,
                  marginTop: 8,
                }}
              >
                Đăng nhập
              </Button>
            </Form>
          </Space>
        </Card>
      </div>
    </div>
  );
};
