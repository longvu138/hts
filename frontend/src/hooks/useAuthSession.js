import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/authApi";
import { registerBeforeAuthReset } from "../api/httpClient";
import { getDefaultAuthenticatedPath } from "../app/navigation";
import {
  getBrowserNotificationPermission,
  isPushNotificationSupported,
  shouldAutoRestorePushForUser,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
} from "../utils/pushSubscription";

// StrictMode chạy effect hai lần ở dev: dùng chung một request /auth/me đang chờ để không gọi (và log 401) hai lần.
let pendingSessionRequest = null;
const loadSession = () => {
  if (!pendingSessionRequest) {
    pendingSessionRequest = authApi.me().finally(() => {
      pendingSessionRequest = null;
    });
  }
  return pendingSessionRequest;
};

const unsubscribeDeviceKeepingPreference = () =>
  unsubscribeCurrentDevice({ silent: true, preserveAutoRestorePreference: true });

/**
 * Phiên đăng nhập của ứng dụng: khởi tạo từ /auth/me, khôi phục Web Push theo người dùng,
 * đăng nhập/đăng xuất và xóa cache React Query mỗi khi người dùng thay đổi để không lộ dữ liệu
 * của tài khoản trước.
 */
export const useAuthSession = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const currentUserId = currentUser?.id;

  useEffect(() => {
    const unregister = registerBeforeAuthReset(unsubscribeDeviceKeepingPreference);
    let active = true;
    loadSession()
      .then((response) => {
        if (!active || !response?.user) return;
        setCurrentUser(response.user);
      })
      .catch(() => {
        // httpClient dùng chung đã xử lý điều hướng và thông báo cho 401/403.
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    const clearSession = () => {
      queryClient.clear();
      setCurrentUser(null);
    };
    window.addEventListener("auth-session-cleared", clearSession);
    return () => {
      active = false;
      unregister();
      window.removeEventListener("auth-session-cleared", clearSession);
    };
  }, [queryClient]);

  useEffect(() => {
    if (
      !currentUserId ||
      !isPushNotificationSupported() ||
      getBrowserNotificationPermission() !== "granted" ||
      !shouldAutoRestorePushForUser(currentUserId)
    ) {
      return;
    }

    subscribeCurrentDevice({
      requestPermission: false,
      rememberPreference: true,
      userId: currentUserId,
    }).catch(() => {
      // Khôi phục Web Push là best-effort; người dùng có thể bật lại trong chuông thông báo.
    });
  }, [currentUserId]);

  const refreshCurrentUser = useCallback(async () => {
    const response = await authApi.me();
    if (!response?.user) return null;
    setCurrentUser(response.user);
    return response.user;
  }, []);

  const handleAuthenticated = useCallback((response) => {
    const nextUser = response?.user || null;
    // Xóa toàn bộ cache trước khi gán người dùng mới: không hiển thị dữ liệu của phiên trước dù chỉ một khung hình.
    queryClient.clear();
    if (nextUser) setCurrentUser(nextUser);
    navigate(nextUser?.mustChangePassword ? "/change-password" : getDefaultAuthenticatedPath(nextUser));
  }, [navigate, queryClient]);

  const handlePasswordChanged = useCallback((response) => {
    const nextUser = { ...currentUser, ...response?.user, mustChangePassword: false };
    setCurrentUser(nextUser);
    navigate(getDefaultAuthenticatedPath(nextUser));
  }, [currentUser, navigate]);

  const handleLogout = useCallback(async () => {
    await unsubscribeDeviceKeepingPreference().catch(() => {});
    await authApi.logout().catch(() => {});
    setCurrentUser(null);
    queryClient.clear();
    navigate("/login");
  }, [navigate, queryClient]);

  return {
    authReady,
    currentUser,
    refreshCurrentUser,
    handleAuthenticated,
    handlePasswordChanged,
    handleLogout,
  };
};
