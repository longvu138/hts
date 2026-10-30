import { Avatar, Button, Dropdown, Layout, Space, Typography } from "antd";
import {
  DownloadOutlined,
  LockOutlined,
  LoginOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { APP_FULL_NAME, APP_NAME } from "../../constants/app";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { NotificationBell } from "./NotificationBell";

const { Header } = Layout;
const { Text } = Typography;

export const AppTopbar = ({
  currentUser,
  sidebarCollapsed,
  onToggleSidebar,
  onLogin,
  onLogout,
  onChangePassword,
  onReload,
  reloading = false,
  showInstallBtn,
  onInstall,
}) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const displayName = currentUser?.name || currentUser?.username || "Tài khoản";

  const profileMenuItems = [
    {
      key: "info",
      label: (
        <div style={{ padding: "4px 8px", minWidth: "160px" }}>
          <div style={{ fontWeight: 600, color: "var(--text)" }}>{displayName}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {currentUser?.departmentName || "Cán bộ"}
          </div>
        </div>
      ),
      disabled: true,
    },
    { type: "divider" },
    {
      key: "password",
      icon: <LockOutlined />,
      label: "Đổi mật khẩu",
      onClick: onChangePassword,
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      danger: true,
      label: "Đăng xuất",
      onClick: onLogout,
    },
  ];

  if (isMobile) {
    return (
      <Header className="topbar topbar-mobile">
        <button
          type="button"
          className="topbar-app-title topbar-app-title-mobile"
          aria-label={`${APP_NAME} - về trang chủ`}
          onClick={() => navigate("/work")}
        >
          {APP_NAME}
        </button>

        <div className="topbar-mobile-actions">
          {showInstallBtn && (
            <Button
              type="text"
              className="topbar-icon-button"
              icon={<DownloadOutlined />}
              onClick={onInstall}
              aria-label="Cài đặt ứng dụng"
            />
          )}
          {onReload ? (
            <Button
              type="text"
              className="topbar-icon-button"
              icon={<ReloadOutlined spin={reloading} />}
              onClick={onReload}
              aria-label="Làm mới dữ liệu"
              aria-busy={reloading || undefined}
              title="Làm mới dữ liệu"
            />
          ) : null}

          {currentUser ? (
            <NotificationBell compact currentUser={currentUser} />
          ) : (
            <Button
              type="text"
              className="topbar-icon-button"
              icon={<LoginOutlined />}
              onClick={onLogin}
              aria-label="Đăng nhập"
            />
          )}
        </div>
      </Header>
    );
  }

  return (
    <Header className="topbar">
      <div className="topbar-left">
        <Button
          className="sidebar-toggle"
          icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          aria-expanded={!sidebarCollapsed}
        />

        <div className="topbar-title-block">
          <button
            type="button"
            className="topbar-app-title"
            aria-label={`${APP_FULL_NAME} - về trang chủ`}
            onClick={() => navigate("/work")}
          >
            <span className="text-xl">{APP_FULL_NAME}</span>
          </button>
        </div>
      </div>
      <Space wrap className="topbar-actions">
        {currentUser ? <NotificationBell compact currentUser={currentUser} /> : null}

        {showInstallBtn && (
          <Button
            className="topbar-action-button font-semibold!"
            icon={<DownloadOutlined />}
            onClick={onInstall}
            size="middle"
          >
            Cài ứng dụng
          </Button>
        )}

        {currentUser ? (
          <Dropdown menu={{ items: profileMenuItems }} trigger={["click"]} placement="bottomRight">
            <button type="button" className="topbar-profile-trigger" aria-label={`Tài khoản của tôi: ${displayName}`}>
              <Avatar
                size={32}
                icon={<UserOutlined />}
                style={{ backgroundColor: "rgba(255, 255, 255, 0.15)", color: "#ffffff" }}
              />
              <Text className="font-bold" style={{ color: "#ffffff" }}>
                {displayName}
              </Text>
            </button>
          </Dropdown>
        ) : (
          <Button className="topbar-action-button" icon={<LoginOutlined />} onClick={onLogin}>
            Đăng nhập
          </Button>
        )}
      </Space>
    </Header>
  );
};
