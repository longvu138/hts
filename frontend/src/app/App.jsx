import { Suspense, useEffect, useMemo, useState } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import viVN from "antd/locale/vi_VN";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import "../styles/base.css";
import "../styles/dashboard-and-mobile.css";
import { AppErrorBoundary } from "../components/common/AppErrorBoundary";
import { ApiFeedbackBridge } from "../components/common/ApiFeedbackBridge";
import { RouteDocumentTitle } from "../components/common/RouteDocumentTitle";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useAuthSession } from "../hooks/useAuthSession";
import { safeLocalStorage } from "../utils/safeStorage";
import { AppRoutes } from "./AppRoutes";

dayjs.locale("vi");

const PageFallback = ({ children = "Đang tải..." }) => (
  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "100px 0", width: "100%" }}>
    <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>{children}</span>
  </div>
);

const buildTheme = (isDark, touchControls) => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: "#cf0011",
    colorPrimaryHover: "#e52e3d",
    colorPrimaryActive: "#b8000f",
    // Chữ phụ mặc định (45% đen ≈ 3.4:1) không đạt WCAG AA; nâng lên ≈ #595959 (7:1) và 60% trắng ở nền tối.
    colorTextDescription: isDark ? "rgba(255, 255, 255, 0.6)" : "#595959",
    colorTextTertiary: isDark ? "rgba(255, 255, 255, 0.6)" : "#595959",
    borderRadius: 10,
    fontSize: 16,
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
  },
  components: {
    Button: {
      controlHeight: touchControls ? 44 : 36,
      controlHeightSM: touchControls ? 44 : 36,
      controlHeightLG: touchControls ? 44 : 36,
      fontSize: 14,
      fontSizeSM: 14,
      fontSizeLG: 14,
      paddingInline: 12,
      paddingInlineSM: 12,
      paddingInlineLG: 12,
      borderRadius: 8,
      borderRadiusSM: 8,
      borderRadiusLG: 8,
    },
    Form: {
      itemMarginBottom: 16,
    },
  },
});

function App() {
  const [themeMode, setThemeMode] = useState(() => safeLocalStorage.getItem("themeMode", "light"));
  const session = useAuthSession();
  const isDark = themeMode === "dark";
  const touchControls = useMediaQuery("(max-width: 1024px), (pointer: coarse)");
  const themeConfig = useMemo(() => buildTheme(isDark, touchControls), [isDark, touchControls]);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    safeLocalStorage.setItem("themeMode", themeMode);
  }, [themeMode]);

  return (
    <ConfigProvider locale={viVN} theme={themeConfig}>
      <AntApp>
        <ApiFeedbackBridge />
        <RouteDocumentTitle />
        <AppErrorBoundary>
          {session.authReady ? (
            <Suspense fallback={<PageFallback />}>
              <AppRoutes
                currentUser={session.currentUser}
                handleAuthenticated={session.handleAuthenticated}
                handleLogout={session.handleLogout}
                handlePasswordChanged={session.handlePasswordChanged}
                refreshCurrentUser={session.refreshCurrentUser}
                themeMode={themeMode}
                setThemeMode={setThemeMode}
              />
            </Suspense>
          ) : (
            <PageFallback>Đang kiểm tra phiên đăng nhập...</PageFallback>
          )}
        </AppErrorBoundary>
      </AntApp>
    </ConfigProvider>
  );
}

export default App;
