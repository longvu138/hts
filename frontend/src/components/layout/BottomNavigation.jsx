import { useState } from "react";
import { Button, Drawer, Typography } from "antd";
import { DownloadOutlined, LockOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { getVisibleNavItems, isNavItemActive } from "../../app/navigation";
import { NavIcon } from "./navIcons";

const { Text, Title } = Typography;

// Mục có tab riêng ở thanh dưới; các mục còn lại (Vai trò & Quyền) nằm trong sheet "Tài khoản của tôi".
const BOTTOM_TAB_KEYS = new Set(["work", "departments", "staff"]);

export const BottomNavigation = ({
  currentUser,
  onLogout,
  onChangePassword,
  installPrompt,
  onInstall,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const visibleItems = getVisibleNavItems(currentUser);
  const tabItems = visibleItems.filter((item) => BOTTOM_TAB_KEYS.has(item.key));
  const sheetNavItems = visibleItems.filter((item) => !BOTTOM_TAB_KEYS.has(item.key));
  const sheetActive = sheetNavItems.some((item) => isNavItemActive(item, pathname));

  const closeThen = (action) => () => {
    setProfileOpen(false);
    action?.();
  };

  const menuItems = [
    ...sheetNavItems.map((item) => ({
      key: item.key,
      icon: <NavIcon navKey={item.key} />,
      label: item.label,
      current: isNavItemActive(item, pathname),
      onClick: closeThen(() => navigate(item.path)),
    })),
    {
      key: "password",
      icon: <LockOutlined />,
      label: "Đổi mật khẩu",
      onClick: closeThen(onChangePassword),
    },
    ...(installPrompt
      ? [{ key: "install", icon: <DownloadOutlined />, label: "Cài đặt ứng dụng", onClick: closeThen(onInstall) }]
      : []),
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Đăng xuất",
      danger: true,
      onClick: closeThen(onLogout),
    },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Điều hướng chính">
      {tabItems.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <div key={item.key} className="mobile-bottom-nav-item-wrapper">
            <button
              type="button"
              className={`mobile-bottom-nav-item ${active ? "mobile-bottom-nav-item-active" : ""}`}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              onClick={() => navigate(item.path)}
            >
              <NavIcon navKey={item.key} className="mobile-bottom-nav-icon" />
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </button>
          </div>
        );
      })}
      <div className="mobile-bottom-nav-item-wrapper">
        <button
          type="button"
          className={`mobile-bottom-nav-item ${profileOpen || sheetActive ? "mobile-bottom-nav-item-active" : ""}`}
          aria-label="Tài khoản"
          aria-haspopup="dialog"
          aria-expanded={profileOpen}
          onClick={() => setProfileOpen(true)}
        >
          <UserOutlined className="mobile-bottom-nav-icon" />
          <span className="mobile-bottom-nav-label">Tài khoản</span>
        </button>
      </div>

      <Drawer
        placement="bottom"
        size="auto"
        closable={false}
        title={
          <div className="mobile-sheet-title">
            <span className="mobile-sheet-handle" aria-hidden="true" />
            <span>Tài khoản của tôi</span>
          </div>
        }
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        className="mobile-profile-sheet-drawer"
        styles={{ body: { padding: "12px 20px 24px", background: "var(--panel-bg)" } }}
      >
        <div style={{ marginBottom: 16, textAlign: "center" }}>
          <Title level={4} style={{ margin: "0 0 4px 0", color: "var(--text)" }}>
            {currentUser?.name || currentUser?.username || "Tài khoản"}
          </Title>
          <Text type="secondary" style={{ fontSize: "13px" }}>
            {currentUser?.departmentName || "Cán bộ"}
          </Text>
        </div>

        <div className="mobile-profile-list">
          {menuItems.map((item) => (
            <Button
              key={item.key}
              type="text"
              block
              danger={item.danger}
              icon={item.icon}
              aria-label={item.label}
              aria-current={item.current ? "page" : undefined}
              onClick={item.onClick}
              className={`mobile-profile-item${item.current ? " nav-active" : ""}`}
            >
              <span className="mobile-profile-item-label">{item.label}</span>
            </Button>
          ))}
        </div>
      </Drawer>
    </nav>
  );
};
