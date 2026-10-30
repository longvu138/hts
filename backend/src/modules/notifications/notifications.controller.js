const notificationsService = require("../../services/notifications.service");
const { auditLog } = require("../../utils/audit-log");

const listMyNotifications = async (req, res, next) => {
  try {
    return res.json(await notificationsService.listMyNotifications(req.user.id, req.query));
  } catch (error) {
    return next(error);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    return res.json({ unreadCount: await notificationsService.countUnread(req.user.id) });
  } catch (error) {
    return next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationsService.markAsRead(req.user.id, req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Không tìm thấy thông báo tương ứng" });
    }
    auditLog(req, "info", {
      event: "notification_marked_read",
      notificationId: req.params.id,
      statusCode: 200,
    });
    return res.json(notification);
  } catch (error) {
    return next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const updatedCount = await notificationsService.markAllAsRead(req.user.id);
    auditLog(req, "info", {
      event: "notifications_marked_all_read",
      updatedCount,
      statusCode: 200,
    });
    return res.json({ updatedCount });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getUnreadCount,
  listMyNotifications,
  markAllAsRead,
  markAsRead,
};
