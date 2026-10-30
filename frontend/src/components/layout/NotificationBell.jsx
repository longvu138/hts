import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Empty, Popover, Space, Typography } from "antd";
import { BellOutlined, CheckOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import {
  useInvalidateNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useUnreadNotificationCount,
} from "../../hooks/useNotifications";
import {
  BROWSER_NOTIFICATIONS_ENABLED_KEY,
  getBrowserNotificationPermission,
  getCurrentPushSubscription,
  isBrowserNotificationSupported,
  isPushNotificationStateEnabled,
  isPushNotificationSupported,
  setForegroundNotificationState,
  setPushNotificationState,
  subscribeCurrentDevice,
  unsubscribeCurrentDevice,
} from "../../utils/pushSubscription";
import { getNotificationTarget } from "../../utils/notificationTarget";
import { safeLocalStorage } from "../../utils/safeStorage";
import { getApiErrorMessage } from "../../utils/apiError";

const { Text } = Typography;

const formatTime = (value) => {
  if (!value) return "";
  const date = dayjs(value);
  if (!date.isValid()) return "";
  return date.format("DD/MM/YYYY HH:mm");
};

export const NotificationBell = ({ compact = false, currentUser = null }) => {
  const currentUserId = currentUser?.id;
  const navigate = useNavigate();
  const notifiedIdsRef = useRef(new Set());
  const hasSeededBrowserNotificationsRef = useRef(false);
  const browserNotificationSupported = isBrowserNotificationSupported();
  const pushNotificationSupported = isPushNotificationSupported();
  const [browserPermission, setBrowserPermission] = useState(() =>
    getBrowserNotificationPermission(),
  );
  const [foregroundNotificationsEnabled, setForegroundNotificationsEnabled] =
    useState(
      () =>
        browserNotificationSupported &&
        getBrowserNotificationPermission() === "granted" &&
        safeLocalStorage.getItem(BROWSER_NOTIFICATIONS_ENABLED_KEY) === "true",
    );
  const [pushNotificationsEnabled, setPushNotificationsEnabled] =
    useState(false);
  const [pushNotificationBusy, setPushNotificationBusy] = useState(false);
  const [pushNotificationError, setPushNotificationError] = useState("");
  const [open, setOpen] = useState(false);
  const browserNotificationActive =
    browserNotificationSupported &&
    browserPermission === "granted" &&
    foregroundNotificationsEnabled &&
    !pushNotificationsEnabled;
  const shouldLoadNotificationList = open || browserNotificationActive;
  const listQuery = useNotificationList({ limit: 10 }, {
    enabled: shouldLoadNotificationList,
    refetchInterval: shouldLoadNotificationList ? 60000 : false,
  });
  const unreadQuery = useUnreadNotificationCount({
    refetchInterval: 60000,
  });

  const invalidateNotifications = useInvalidateNotifications();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const markNotificationRead = markReadMutation.mutate;

  const rawNotifications = listQuery.data?.items;
  const notifications = useMemo(
    () => (Array.isArray(rawNotifications) ? rawNotifications.filter(Boolean) : []),
    [rawNotifications],
  );
  const unreadCount = unreadQuery.data?.unreadCount || 0;
  const handleNotificationClick = async (item) => {
    setOpen(false);
    navigate(getNotificationTarget(item));
    if (!item.readAt) {
      markReadMutation.mutate(item.id);
    }
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
    setOpen(false);
  };

  const handleBrowserNotificationToggle = async () => {
    if (!browserNotificationSupported) return;

    setPushNotificationError("");
    setPushNotificationBusy(true);
    try {
      if (pushNotificationSupported) {
        if (pushNotificationsEnabled) {
          await unsubscribeCurrentDevice();
          setPushNotificationsEnabled(false);
          setForegroundNotificationsEnabled(false);
          return;
        }

        // Truyền userId để lưu lựa chọn tự bật lại Web Push sau khi đăng nhập lại.
        const result = await subscribeCurrentDevice({ userId: currentUserId });
        const nextPermission = result.permission;
        setBrowserPermission(nextPermission);
        if (!result.enabled) {
          setPushNotificationState(false);
          setPushNotificationsEnabled(false);
          return;
        }

        setPushNotificationsEnabled(true);
        setForegroundNotificationsEnabled(false);
        return;
      }

      if (foregroundNotificationsEnabled) {
        setForegroundNotificationState(false);
        setForegroundNotificationsEnabled(false);
        return;
      }

      let nextPermission = getBrowserNotificationPermission();
      if (nextPermission === "default") {
        nextPermission = await window.Notification.requestPermission();
      }
      setBrowserPermission(nextPermission);
      const enabled = nextPermission === "granted";
      setForegroundNotificationState(enabled);
      setForegroundNotificationsEnabled(enabled);
    } catch (error) {
      // 409 (thiết bị thuộc tài khoản khác) / 422 (endpoint không hợp lệ, quá 10 thiết bị): hiện thông điệp của máy chủ.
      setPushNotificationError(error?.response ? getApiErrorMessage(error, "Không thể bật thông báo") : error?.message || "Không thể bật thông báo");
    } finally {
      setPushNotificationBusy(false);
    }
  };

  useEffect(() => {
    if (!pushNotificationSupported || browserPermission !== "granted") return;

    let active = true;
    getCurrentPushSubscription()
      .then((subscription) => {
        if (!active) return;
        const enabled =
          Boolean(subscription) && isPushNotificationStateEnabled();
        setPushNotificationsEnabled(enabled);
        if (!subscription) setPushNotificationState(false);
      })
      .catch(() => {
        if (!active) return;
        setPushNotificationsEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [browserPermission, pushNotificationSupported]);

  useEffect(() => {
    if (!browserNotificationSupported || !notifications.length) return;

    const unreadNotifications = notifications.filter((item) => !item.readAt);
    if (!hasSeededBrowserNotificationsRef.current) {
      unreadNotifications.forEach((item) =>
        notifiedIdsRef.current.add(item.id),
      );
      hasSeededBrowserNotificationsRef.current = true;
      return;
    }

    unreadNotifications.forEach((item) => {
      if (notifiedIdsRef.current.has(item.id)) return;
      notifiedIdsRef.current.add(item.id);
      if (!browserNotificationActive) return;

      let browserNotification;
      try {
        // Android Chrome chỉ cho phép thông báo qua service worker: constructor ném TypeError.
        browserNotification = new window.Notification(item.title || "Thông báo", {
          body: item.message || "Bạn có thông báo mới",
          tag: item.id,
        });
      } catch {
        return;
      }
      browserNotification.onclick = () => {
        window.focus();
        if (!item.readAt) {
          markNotificationRead(item.id);
        }
        navigate(getNotificationTarget(item));
        browserNotification.close();
      };
    });
  }, [
    browserNotificationActive,
    browserNotificationSupported,
    invalidateNotifications,
    markNotificationRead,
    navigate,
    notifications,
  ]);

  const notificationStatusText = () => {
    if (!browserNotificationSupported) return "Trình duyệt không hỗ trợ";
    if (browserPermission === "denied")
      return "Trình duyệt đang chặn quyền thông báo";
    if (pushNotificationSupported) {
      if (pushNotificationsEnabled)
        return "Đang bật Web Push khi ứng dụng đóng hoặc chạy nền";
      if (browserPermission === "granted")
        return "Có thể bật lại thông báo trên thiết bị này";
      return "Nhận Web Push khi ứng dụng đóng hoặc chạy nền";
    }
    return browserNotificationActive
      ? "Đang bật khi ứng dụng đang mở"
      : "Trình duyệt chỉ hỗ trợ khi ứng dụng đang mở";
  };

  const notificationToggleEnabled = pushNotificationSupported
    ? pushNotificationsEnabled
    : foregroundNotificationsEnabled;

  const content = (
    <div className="notification-popover">
      <div className="notification-popover-header">
        <Text strong>Thông báo</Text>
        <Button
          size="small"
          type="link"
          className="notification-mark-all"
          icon={<CheckOutlined />}
          aria-label="Đánh dấu tất cả đã đọc"
          disabled={!unreadCount}
          loading={markAllReadMutation.isPending}
          onClick={handleMarkAllRead}
        >
          Đánh dấu tất cả đã đọc
        </Button>
      </div>
      <div className="notification-browser-row">
        <Space orientation="vertical" size={0}>
          <Text>Thông báo trình duyệt</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {notificationStatusText()}
            {pushNotificationError ? ` - ${pushNotificationError}` : ""}
          </Text>
        </Space>
        <Button
          size="small"
          className="notification-toggle-button"
          type={notificationToggleEnabled ? "default" : "primary"}
          aria-label={notificationToggleEnabled ? "Tắt thông báo trình duyệt" : "Bật thông báo trình duyệt"}
          disabled={
            !browserNotificationSupported || browserPermission === "denied"
          }
          loading={pushNotificationBusy}
          onClick={handleBrowserNotificationToggle}
        >
          {notificationToggleEnabled ? "Tắt" : "Bật"}
        </Button>
      </div>
      {notifications.length ? (
        <ul className="notification-list" aria-label="Danh sách thông báo">
          {notifications.map((item) => (
            <li
              key={item.id}
              className={`notification-item${item.readAt ? "" : " notification-item-unread"}`}
            >
              <button
                type="button"
                className="notification-item-button"
                onClick={() => handleNotificationClick(item)}
                aria-label={`Mở thông báo: ${item.title || "Không có tiêu đề"}`}
              >
                <Space orientation="vertical" size={3} style={{ width: "100%" }}>
                  <Text strong={!item.readAt} className="notification-title" title={item.title || "Thông báo"}>
                    {item.title || "Thông báo"}
                  </Text>
                  {item.message && (
                    <Text type="secondary" className="notification-message">
                      {item.message}
                    </Text>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatTime(item.createdAt) || "---"}
                  </Text>
                </Space>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có thông báo"
        />
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      trigger="click"
      placement="bottom"
      classNames={{ root: "notification-popover-overlay" }}
      content={content}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) invalidateNotifications();
      }}
    >
      <Badge
        count={unreadCount}
        size="small"
        offset={compact ? [-6, 6] : [-2, 2]}
        className="notification-bell-badge"
      >
        <Button
          type={compact ? "text" : "default"}
          className={compact ? "topbar-icon-button notification-bell-button" : "topbar-action-button"}
          icon={<BellOutlined className={compact ? "text-lg!" : "text-xl!"} />}
          aria-label="Thông báo"
          size={compact ? "middle" : "large"}
        >
          {compact ? null : "Thông báo"}
        </Button>
      </Badge>
    </Popover>
  );
};
