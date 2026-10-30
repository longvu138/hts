import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../api/notificationsApi";

const notificationKeys = {
  all: ["notifications"],
  list: (params = {}) => ["notifications", "list", params],
  unreadCount: ["notifications", "unread-count"],
};

export const useNotificationList = (params = {}, options = {}) =>
  useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationsApi.list(params),
    ...options,
  });

export const useUnreadNotificationCount = (options = {}) =>
  useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    ...options,
  });

const useNotificationMutation = (mutationFn) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
};

export const useMarkNotificationRead = () =>
  useNotificationMutation(notificationsApi.markAsRead);

export const useMarkAllNotificationsRead = () =>
  useNotificationMutation(notificationsApi.markAllAsRead);

export const useInvalidateNotifications = () => {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    [queryClient],
  );
};
