const db = require("../config/database");
const { createUuid } = require("../utils/uuid");
const logger = require("../utils/logger");
const pushNotificationsService = require("../modules/notifications/push-notifications.service");
const { httpError: createHttpError } = require("../utils/http-error");
const { parsePagination } = require("../utils/pagination");
const { toIsoUtc } = require("../utils/datetime");

const DEFAULT_LIMIT = 20;

const normalizeMetadata = (metadata) => {
  if (metadata === undefined || metadata === null) return null;
  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return metadata;
    }
  }
  return metadata;
};

const toDbMetadata = (metadata) => {
  if (metadata === undefined || metadata === null) return null;
  return typeof metadata === "string" ? metadata : JSON.stringify(metadata);
};

const mapNotification = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: normalizeMetadata(row.metadata),
    readAt: toIsoUtc(row.read_at),
    createdAt: toIsoUtc(row.created_at),
    updatedAt: toIsoUtc(row.updated_at),
  };
};

const getClient = (trx) => trx || db;

const dispatchNotificationPush = (notification) => {
  if (!notification?.recipientUserId) return Promise.resolve();

  return pushNotificationsService
    .sendToUser({ userId: notification.recipientUserId, notification })
    .catch((error) => logger.warn(`Web Push dispatch failed: ${error.message || "unknown error"}`));
};

const shouldDispatchPush = (options = {}) => {
  if (options.dispatchPush === false) return false;
  if (options.trx) return false;
  return true;
};

const createNotification = async (
  {
    recipientUserId,
    type,
    title,
    message = null,
    entityType = null,
    entityId = null,
    metadata = null,
  },
  options = {},
) => {
  if (!recipientUserId) throw createHttpError(422, "Thiếu người nhận thông báo");
  if (!type) throw createHttpError(422, "Thiếu loại thông báo");
  if (!title) throw createHttpError(422, "Thiếu tiêu đề thông báo");

  const client = getClient(options.trx);
  const id = createUuid();
  await client("notifications").insert({
    id,
    recipient_user_id: recipientUserId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    metadata: toDbMetadata(metadata),
  });

  const notification = mapNotification(await client("notifications").where({ id }).first());

  if (shouldDispatchPush(options)) {
    dispatchNotificationPush(notification);
  }

  return notification;
};

// Batch variant used inside write transactions: one insert and one select for all recipients.
const createNotifications = async (items = [], options = {}) => {
  if (!items.length) return [];
  for (const item of items) {
    if (!item.recipientUserId) throw createHttpError(422, "Thiếu người nhận thông báo");
    if (!item.type) throw createHttpError(422, "Thiếu loại thông báo");
    if (!item.title) throw createHttpError(422, "Thiếu tiêu đề thông báo");
  }
  const client = getClient(options.trx);
  const rows = items.map((item) => ({
    id: createUuid(),
    recipient_user_id: item.recipientUserId,
    type: item.type,
    title: item.title,
    message: item.message ?? null,
    entity_type: item.entityType ?? null,
    entity_id: item.entityId ?? null,
    metadata: toDbMetadata(item.metadata),
  }));
  await client("notifications").insert(rows);
  const saved = await client("notifications").whereIn("id", rows.map((row) => row.id));
  const byId = new Map(saved.map((row) => [row.id, row]));
  const notifications = rows.map((row) => mapNotification(byId.get(row.id)));
  if (shouldDispatchPush(options)) notifications.forEach((notification) => dispatchNotificationPush(notification));
  return notifications;
};

const listMyNotifications = async (recipientUserId, query = {}, options = {}) => {
  if (!recipientUserId) throw createHttpError(422, "Thiếu người nhận thông báo");

  const client = getClient(options.trx);
  const { page, limit, offset } = parsePagination(query, { defaultLimit: DEFAULT_LIMIT });

  const buildBaseQuery = () => {
    const baseQuery = client("notifications").where({ recipient_user_id: recipientUserId });
    if (query.unread === true || query.unread === "true" || query.isRead === false || query.isRead === "false") {
      baseQuery.whereNull("read_at");
    }
    if (query.type) baseQuery.where({ type: query.type });
    return baseQuery;
  };

  const [{ total }] = await buildBaseQuery().clone().count({ total: "*" });
  const rows = await buildBaseQuery()
    .clone()
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map(mapNotification),
    pagination: {
      page,
      limit,
      total: Number(total || 0),
    },
  };
};

const countUnread = async (recipientUserId, options = {}) => {
  if (!recipientUserId) throw createHttpError(422, "Thiếu người nhận thông báo");
  const client = getClient(options.trx);
  const [{ total }] = await client("notifications")
    .where({ recipient_user_id: recipientUserId })
    .whereNull("read_at")
    .count({ total: "*" });
  return Number(total || 0);
};

const markAsRead = async (recipientUserId, notificationId, options = {}) => {
  if (!recipientUserId) throw createHttpError(422, "Thiếu người nhận thông báo");
  if (!notificationId) throw createHttpError(422, "Thiếu thông báo cần cập nhật");

  const client = getClient(options.trx);
  const notification = await client("notifications")
    .where({ id: notificationId, recipient_user_id: recipientUserId })
    .first();
  if (!notification) return null;

  if (!notification.read_at) {
    await client("notifications")
      .where({ id: notificationId, recipient_user_id: recipientUserId })
      .update({ read_at: client.fn.now() });
  }

  return mapNotification(
    await client("notifications")
      .where({ id: notificationId, recipient_user_id: recipientUserId })
      .first(),
  );
};

const markAllAsRead = async (recipientUserId, options = {}) => {
  if (!recipientUserId) throw createHttpError(422, "Thiếu người nhận thông báo");
  const client = getClient(options.trx);
  return client("notifications")
    .where({ recipient_user_id: recipientUserId })
    .whereNull("read_at")
    .update({ read_at: client.fn.now() });
};

module.exports = {
  dispatchNotificationPush,
  createNotification,
  createNotifications,
  countUnread,
  listMyNotifications,
  markAllAsRead,
  markAsRead,
};
