const crypto = require('crypto');

const logger = require('../utils/logger');
const { getClientInfo } = require('../utils/client-info');

const REQUEST_ID_HEADER = 'x-request-id';
// Only simple ids are echoed/logged, so a client cannot inject log lines or headers.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

const getRequestId = (req) => {
  const incomingRequestId = req.get(REQUEST_ID_HEADER);

  if (typeof incomingRequestId === 'string' && REQUEST_ID_PATTERN.test(incomingRequestId)) {
    return incomingRequestId;
  }

  return crypto.randomUUID();
};

const requestContext = (req, res, next) => {
  req.requestId = getRequestId(req);
  req.clientInfo = getClientInfo(req);
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

const accessLog = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info({
      event: 'http_request',
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      responseTimeMs: Number(durationMs.toFixed(2)),
      contentLength: res.getHeader('content-length') || null,
      userId: req.user?.id,
      sessionId: req.authSession?.public_id,
      ip: req.clientInfo.ipAddress,
      userAgent: req.clientInfo.userAgent,
      browser: req.clientInfo.browser,
      operatingSystem: req.clientInfo.os,
      deviceType: req.clientInfo.deviceType,
    });
  });

  next();
};

module.exports = {
  accessLog,
  getRequestId,
  requestContext,
};
