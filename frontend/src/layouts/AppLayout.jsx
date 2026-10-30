import { useState, useEffect } from "react";
import { useIsMobile } from "../hooks/useMediaQuery";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { MobileAppLayout } from "./MobileAppLayout";

export const AppLayout = ({
  currentUser,
  onLogin,
  onLogout,
  onChangePassword,
  themeMode,
  onToggleTheme,
}) => {
  // Đọc matchMedia đồng bộ ngay lần render đầu để không mount cây mobile rồi lại đổi sang desktop.
  const isMobile = useIsMobile();

  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setInstallPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const layoutProps = {
    currentUser,
    onLogin,
    onLogout,
    onChangePassword,
    themeMode,
    onToggleTheme,
    installPrompt,
    handleInstall,
  };

  if (isMobile) {
    return <MobileAppLayout {...layoutProps} />;
  }

  return <DesktopAppLayout {...layoutProps} />;
};
