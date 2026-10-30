const express = require("express");

const notificationsController = require("./notifications.controller");
const { authenticate, requirePasswordReady } = require("../../middlewares/auth.middleware");

const router = express.Router();

router.use(authenticate, requirePasswordReady);

/**
 * GET /notifications
 * Lay danh sach thong bao cua user dang dang nhap.
 * Query: page?, limit?, unread?, type?.
 * Success 200: { items, pagination }.
 * Fail: 401 chua dang nhap; 403 can doi mat khau.
 */
router.get("/", notificationsController.listMyNotifications);

/**
 * GET /notifications/unread-count
 * Dem so thong bao chua doc cua user dang dang nhap.
 * Success 200: { unreadCount }.
 * Fail: 401 chua dang nhap; 403 can doi mat khau.
 */
router.get("/unread-count", notificationsController.getUnreadCount);

/**
 * PATCH /notifications/read-all
 * Danh dau tat ca thong bao cua user dang dang nhap la da doc.
 * Success 200: { updatedCount }.
 * Fail: 401 chua dang nhap; 403 can doi mat khau.
 */
router.patch("/read-all", notificationsController.markAllAsRead);

/**
 * PATCH /notifications/:id/read
 * Danh dau mot thong bao cua user dang dang nhap la da doc.
 * Params: id = notification id.
 * Success 200: Notification.
 * Fail: 401 chua dang nhap; 403 can doi mat khau; 404 khong tim thay thong bao cua user hien tai.
 */
router.patch("/:id/read", notificationsController.markAsRead);

module.exports = router;
