const buildNotificationUrl = (notification = {}) => notification.entityType === 'work' && /^[a-f0-9-]{36}$/i.test(notification.entityId || '') ? `/work?workId=${encodeURIComponent(notification.entityId)}` : '/';
module.exports = { buildNotificationUrl };
