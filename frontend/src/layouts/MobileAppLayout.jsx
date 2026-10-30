import { Suspense, useState } from "react";
import { Layout } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { AppTopbar } from "../components/layout/AppTopbar";
import { BottomNavigation } from "../components/layout/BottomNavigation";

const { Content } = Layout;

export const MobileAppLayout = ({
  currentUser,
  onLogin,
  onLogout,
  onChangePassword,
  themeMode,
  onToggleTheme,
  installPrompt,
  handleInstall,
}) => {
  const queryClient = useQueryClient();
  const [reloading, setReloading] = useState(false);
  // "Làm mới dữ liệu": tải lại dữ liệu đang hiển thị từ máy chủ, không tải lại cả trang.
  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setReloading(false);
    }
  };

  return (
    <Layout className="app-shell h-dvh min-h-dvh overflow-hidden bg-[var(--app-bg)] page-fade-in">
      <AppTopbar
        currentUser={currentUser}
        themeMode={themeMode}
        onToggleTheme={onToggleTheme}
        onReload={handleReload}
        reloading={reloading}
        onLogin={onLogin}
        onLogout={onLogout}
        onChangePassword={onChangePassword}
        showInstallBtn={!!installPrompt}
        onInstall={handleInstall}
      />

      <Layout className="main-body-layout min-h-0 min-w-0 overflow-hidden bg-[var(--app-bg)] w-full flex-1">
        <Content
          className="mobile-scrollbar-hidden h-full min-h-0 overflow-auto bg-[var(--app-bg)] px-2 pt-3 max-md:h-full max-md:w-full max-md:[-webkit-overflow-scrolling:touch]"
          style={{ paddingBottom: "calc(112px + env(safe-area-inset-bottom, 0px))" }}
        >
          <Suspense fallback={<div className="page-loading-fallback">Đang tải...</div>}>
            <Outlet context={{ themeMode, currentUser }} />
          </Suspense>
        </Content>
      </Layout>

      <BottomNavigation
        currentUser={currentUser}
        onLogout={onLogout}
        onChangePassword={onChangePassword}
        installPrompt={installPrompt}
        onInstall={handleInstall}
      />
    </Layout>
  );
};
