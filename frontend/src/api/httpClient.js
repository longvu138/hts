import axios from "axios";
import { getApiRequestId } from "../utils/apiError";

export const httpClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "/api" : "http://localhost:3108/api"),
  timeout: 8000,
  withCredentials: true,
});

let authCleanupPromise = null;
let csrfToken = null;
let authResetStarted = false;
let beforeAuthResetHandler = null;

/**
 * Đăng ký việc dọn dẹp chạy trước khi xóa phiên do 401 (ví dụ hủy Web Push của thiết bị).
 * Dùng callback thay cho dynamic import để tránh vòng phụ thuộc httpClient -> pushSubscription -> pushApi.
 */
export const registerBeforeAuthReset = (handler) => {
  beforeAuthResetHandler = typeof handler === "function" ? handler : null;
  return () => {
    if (beforeAuthResetHandler === handler) beforeAuthResetHandler = null;
  };
};

const cleanupBeforeAuthReset = () => {
  if (authCleanupPromise) return authCleanupPromise;

  authCleanupPromise = Promise.resolve()
    .then(() => beforeAuthResetHandler?.())
    .catch(() => {})
    .finally(() => {
      authCleanupPromise = null;
    });

  return authCleanupPromise;
};

httpClient.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (!["get", "head", "options"].includes(method) && csrfToken) {
    config.headers["X-CSRF-Token"] = csrfToken;
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => {
    if (response.data?.csrfToken) {
      csrfToken = response.data.csrfToken;
      authResetStarted = false;
    }
    return response;
  },
  async (error) => {
    const requestId = getApiRequestId(error);
    if (requestId) error.requestId = requestId;

    if (error.response?.status === 403 && error.response?.data?.code === "PASSWORD_CHANGE_REQUIRED") {
      if (window.location.pathname !== "/change-password") {
        window.location.assign("/change-password");
      }
    }

    if (error.response?.status === 403 && error.response?.data?.code !== "PASSWORD_CHANGE_REQUIRED") {
      if (!error.config?.skipGlobalError) {
        window.dispatchEvent(
          new CustomEvent("api-forbidden", {
            detail: {
              message: error.response?.data?.message || "Bạn không có quyền thực hiện thao tác này",
            },
          }),
        );
      }
    }

    if (error.response?.status === 401) {
      if (authResetStarted) return Promise.reject(error);
      authResetStarted = true;
      if (!error.config?.skipAuthCleanup) {
        await cleanupBeforeAuthReset();
      }
      csrfToken = null;
      window.dispatchEvent(new Event("auth-session-cleared"));
      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  },
);
