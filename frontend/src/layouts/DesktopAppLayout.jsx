import { Suspense, useState } from "react";
import { Layout } from "antd";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "../components/layout/AppSidebar";
import { AppTopbar } from "../components/layout/AppTopbar";
import { safeLocalStorage } from "../utils/safeStorage";
import { resolveInitialSidebarCollapsed, SIDEBAR_COLLAPSED_KEY, SIDEBAR_EXPANDED_MEDIA_QUERY } from "./sidebarPreference";

const { Content } = Layout;

export const DesktopAppLayout = ({
  currentUser,
  onLogin,
  onLogout,
  onChangePassword,
  themeMode,
  onToggleTheme,
  installPrompt,
  handleInstall,
}) => {
  // Mặc định mở rộng (có nhãn) từ 1280px; lựa chọn của người dùng được ghi nhớ.
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => {
    const isWideScreen = typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(SIDEBAR_EXPANDED_MEDIA_QUERY).matches
      : true;
    return resolveInitialSidebarCollapsed(safeLocalStorage.getItem(SIDEBAR_COLLAPSED_KEY), isWideScreen);
  });
  const setSidebarCollapsed = (value) => {
    const next = Boolean(value);
    setSidebarCollapsedState(next);
    safeLocalStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "true" : "false");
  };

  return (
    <Layout className="app-shell h-dvh min-h-dvh overflow-hidden bg-[var(--app-bg)] page-fade-in">
      <AppTopbar
        currentUser={currentUser}
        themeMode={themeMode}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onToggleTheme={onToggleTheme}
        onLogin={onLogin}
        onLogout={onLogout}
        onChangePassword={onChangePassword}
        showInstallBtn={!!installPrompt}
        onInstall={handleInstall}
      />

      <Layout className="main-body-layout min-h-0 min-w-0 overflow-hidden bg-[var(--app-bg)]">
        <AppSidebar
          collapsed={sidebarCollapsed}
          currentUser={currentUser}
          onCollapse={setSidebarCollapsed}
        />
        <Content className="h-full min-h-0 overflow-auto bg-[var(--app-bg)] px-4 pt-4 pb-5 max-[980px]:p-3">
          <Suspense fallback={<div className="page-loading-fallback">Đang tải...</div>}>
            <Outlet context={{ themeMode, currentUser }} />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
};
