const webPush = require("web-push");

const pushConfig = require("../../config/push");
const logger = require("../../utils/logger");
const pushSubscriptionsService = require("./push-subscriptions.service");
const { buildNotificationUrl } = require("./notification-target");

if (pushConfig.enabled) {
  webPush.setVapidDetails(pushConfig.subject, pushConfig.publicKey, pushConfig.privateKey);
}

const sendToUser = async ({ userId, notification }) => {
  if (!pushConfig.enabled || !userId || !notification) return;

  const subscriptions = await pushSubscriptionsService.listActiveByUser(userId);
  if (!subscriptions.length) return;

  const payload = JSON.stringify({
    title: notification.title,
    message: notification.message || "Bạn có thông báo mới",
    url: buildNotificationUrl(notification),
    notificationId: notification.id,
    entityType: notification.entityType,
    entityId: notification.entityId,
  });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );
        await pushSubscriptionsService.markUsed(subscription.id);
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await pushSubscriptionsService.markRevoked(subscription.id);
          return;
        }

        logger.warn(
          `Web Push send failed for subscription ${subscription.id}: ${error.message || "unknown error"}`,
        );
      }
    }),
  );
};

module.exports = {
  sendToUser,
};
