// Side effects of work commands: notifications are stored inside the transaction,
// audit log and Web Push run only after commit.
const {
  createNotifications,
  dispatchNotificationPush
} = require('../../services/notifications.service');
const { auditLog } = require('../../utils/audit-log');
// The actor never receives a notification about their own action.
const notify = async (trx, req, ids, workId, title) => {
  const recipients = [...new Set(ids)].filter(id => id && id !== req.user.id);
  return createNotifications(recipients.map(recipientUserId => ({
    recipientUserId,
    type: 'work.changed',
    title,
    entityType: 'work',
    entityId: workId
  })), {
    trx
  });
};
const committed = (req, event, result) => {
  auditLog(req, 'info', {
    event,
    workId: result.workId,
    assignmentIds: result.ids,
    reason: result.reason,
    pastStartConfirmed: result.pastStartConfirmed,
    before: result.before,
    after: result.after
  });
  for (const n of result.notifications || []) void dispatchNotificationPush(n);
  return {
    workId: result.workId,
    version: result.version
  };
};
module.exports = {
  notify,
  committed
};
