import { httpClient } from "./httpClient";

export const notificationsApi = {
  list: (params) => httpClient.get("/notifications", { params }).then((response) => response.data),
  unreadCount: () => httpClient.get("/notifications/unread-count").then((response) => response.data),
  markAsRead: (id) => httpClient.patch(`/notifications/${id}/read`).then((response) => response.data),
  markAllAsRead: () => httpClient.patch("/notifications/read-all").then((response) => response.data),
};
