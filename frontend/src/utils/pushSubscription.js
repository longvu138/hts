import { pushApi } from "../api/pushApi";
import { urlBase64ToUint8Array } from "./push";
import { safeLocalStorage } from "./safeStorage";

export const BROWSER_NOTIFICATIONS_ENABLED_KEY = "browserNotificationsEnabled";
const PUSH_NOTIFICATIONS_ENABLED_KEY = "pushNotificationsEnabled";
const PUSH_NOTIFICATIONS_AUTO_RESTORE_KEY = "pushNotificationsAutoRestore";
const PUSH_NOTIFICATIONS_AUTO_RESTORE_USER_KEY = "pushNotificationsAutoRestoreUserId";
const SERVICE_WORKER_READY_TIMEOUT_MS = 3000;

export const isBrowserNotificationSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

export const isPushNotificationSupported = () =>
  isBrowserNotificationSupported() &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

export const getBrowserNotificationPermission = () => {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return window.Notification.permission;
};

export const setForegroundNotificationState = (enabled) => {
  safeLocalStorage.setItem(BROWSER_NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
};

export const setPushNotificationState = (enabled) => {
  safeLocalStorage.setItem(PUSH_NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");
};

export const isPushNotificationStateEnabled = () =>
  safeLocalStorage.getItem(PUSH_NOTIFICATIONS_ENABLED_KEY) === "true";

const setPushAutoRestorePreference = (enabled, userId = null) => {
  safeLocalStorage.setItem(PUSH_NOTIFICATIONS_AUTO_RESTORE_KEY, enabled ? "true" : "false");
  if (enabled && userId) {
    safeLocalStorage.setItem(PUSH_NOTIFICATIONS_AUTO_RESTORE_USER_KEY, userId);
  } else if (!enabled) {
    safeLocalStorage.removeItem(PUSH_NOTIFICATIONS_AUTO_RESTORE_USER_KEY);
  }
};

export const shouldAutoRestorePushForUser = (userId) =>
  Boolean(userId) &&
  safeLocalStorage.getItem(PUSH_NOTIFICATIONS_AUTO_RESTORE_KEY) === "true" &&
  safeLocalStorage.getItem(PUSH_NOTIFICATIONS_AUTO_RESTORE_USER_KEY) === userId;

const clearNotificationDeviceState = () => {
  setPushNotificationState(false);
  setForegroundNotificationState(false);
};

const getReadyServiceWorkerRegistration = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Không thể kết nối service worker để cập nhật Web Push")),
        SERVICE_WORKER_READY_TIMEOUT_MS,
      );
    }),
  ]);

export const getCurrentPushSubscription = async () => {
  if (!isPushNotificationSupported()) return null;
  const registration = await getReadyServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
};

export const subscribeCurrentDevice = async ({
  requestPermission = true,
  rememberPreference = true,
  userId,
} = {}) => {
  if (!isPushNotificationSupported()) {
    return { enabled: false, permission: getBrowserNotificationPermission(), subscription: null };
  }

  let permission = getBrowserNotificationPermission();
  if (permission === "default" && requestPermission) {
    permission = await window.Notification.requestPermission();
  }

  if (permission !== "granted") {
    setPushNotificationState(false);
    return { enabled: false, permission, subscription: null };
  }

  const registration = await getReadyServiceWorkerRegistration();
  const currentSubscription = await registration.pushManager.getSubscription();
  const vapid = await pushApi.getVapidPublicKey();
  if (!vapid.enabled || !vapid.publicKey) {
    throw new Error("Máy chủ chưa bật Web Push");
  }

  const subscription =
    currentSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
    }));

  await pushApi.saveSubscription(subscription.toJSON());
  setPushNotificationState(true);
  setForegroundNotificationState(false);
  if (rememberPreference) setPushAutoRestorePreference(true, userId);

  return { enabled: true, permission, subscription };
};

export const unsubscribeCurrentDevice = async ({
  silent = false,
  preserveAutoRestorePreference = false,
} = {}) => {
  let firstError = null;

  if (!isPushNotificationSupported()) {
    clearNotificationDeviceState();
    if (!preserveAutoRestorePreference) setPushAutoRestorePreference(false);
    return { unsubscribed: false, subscription: null };
  }

  let subscription;
  try {
    subscription = await getCurrentPushSubscription();
  } catch (error) {
    clearNotificationDeviceState();
    if (!preserveAutoRestorePreference) setPushAutoRestorePreference(false);
    if (!silent) throw error;
    return { unsubscribed: false, subscription: null };
  }
  if (subscription?.endpoint) {
    try {
      await pushApi.deleteSubscription(subscription.endpoint, {
        skipAuthCleanup: true,
        skipGlobalError: true,
      });
    } catch (error) {
      firstError = firstError || error;
    }

    try {
      await subscription.unsubscribe();
    } catch (error) {
      firstError = firstError || error;
    }
  }

  clearNotificationDeviceState();
  if (!preserveAutoRestorePreference) setPushAutoRestorePreference(false);

  if (firstError && !silent) {
    throw firstError;
  }

  return { unsubscribed: Boolean(subscription), subscription };
};
