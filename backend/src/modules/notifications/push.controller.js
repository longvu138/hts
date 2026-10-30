const pushConfig = require("../../config/push");
const pushSubscriptionsService = require("./push-subscriptions.service");
const { auditLog } = require("../../utils/audit-log");

const getVapidPublicKey = (req, res) => {
  return res.json({
    enabled: pushConfig.enabled,
    publicKey: pushConfig.publicKey,
  });
};

const saveSubscription = async (req, res, next) => {
  try {
    const subscription = await pushSubscriptionsService.upsertSubscription({
      userId: req.user.id,
      subscription: req.body,
      userAgent: req.headers["user-agent"] || null,
    });
    auditLog(req, "info", {
      event: "push_subscription_saved",
      subscriptionId: subscription.id,
      statusCode: 201,
    });
    return res.status(201).json(subscription);
  } catch (error) {
    return next(error);
  }
};

const deleteSubscription = async (req, res, next) => {
  try {
    const updatedCount = await pushSubscriptionsService.revokeSubscription({
      userId: req.user.id,
      endpoint: req.body?.endpoint,
    });
    auditLog(req, "info", {
      event: "push_subscription_deleted",
      updatedCount,
      statusCode: 200,
    });
    return res.json({ updatedCount });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  deleteSubscription,
  getVapidPublicKey,
  saveSubscription,
};
