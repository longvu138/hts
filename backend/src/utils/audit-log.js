const logger = require('./logger');
const { getClientInfo } = require('./client-info');

const auditLog = (req, level, payload) => {
  const client = req.clientInfo || getClientInfo(req);
  logger[level]({
    requestId: req.requestId,
    actorUserId: req.user?.id,
    method: req.method,
    path: req.originalUrl,
    sessionId: req.authSession?.public_id,
    ip: client.ipAddress,
    userAgent: client.userAgent,
    browser: client.browser,
    operatingSystem: client.os,
    deviceType: client.deviceType,
    ...payload,
  });
};

module.exports = {
  auditLog,
};
