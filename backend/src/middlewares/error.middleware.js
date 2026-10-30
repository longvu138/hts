const logger = require('../utils/logger');
const { isSocketError } = require('../config/mysql-connection');
const { sanitizeForLog } = require('../utils/sanitize-log');
const { getClientInfo } = require('../utils/client-info');
const { AppError } = require('../utils/http-error');

const notFoundHandler = (req, res, next) => {
  next(new AppError(404, `Đường dẫn không tồn tại: ${req.method} ${req.originalUrl}`));
};

const errorHandler = (error, req, res, next) => {
  const isTransientDatabaseError = isSocketError(error);
  const invalidJson = error instanceof SyntaxError && error.type === 'entity.parse.failed';
  const entityTooLarge = error.type === 'entity.too.large';
  const statusCode = error.statusCode || (
    invalidJson ? 400 : entityTooLarge ? 413 : isTransientDatabaseError ? 503 : 500
  );
  const client = req.clientInfo || getClientInfo(req);
  const logPayload = {
    event: statusCode >= 500 ? 'request_error' : 'request_warning',
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    userId: req.user?.id,
    sessionId: req.authSession?.public_id,
    ip: client.ipAddress,
    userAgent: client.userAgent,
    browser: client.browser,
    operatingSystem: client.os,
    deviceType: client.deviceType,
    message: error.message,
    code: error.code,
    errno: error.errno,
    fatal: error.fatal,
    transientDatabaseError: isTransientDatabaseError || undefined,
    stack: statusCode >= 500 ? error.stack : undefined,
    params: sanitizeForLog(req.params),
    query: sanitizeForLog(req.query),
    body: sanitizeForLog(req.body),
  };

  if (statusCode >= 500) {
    logger.error(logPayload);
  } else {
    logger.warn({
      ...logPayload,
      event: statusCode === 403 ? 'permission_denied_error' : logPayload.event,
    });
  }

  // Only codes we set on purpose (4xx/503 app errors) are public; raw driver codes such as
  // ER_DUP_ENTRY stay in the log.
  const publicCode = error instanceof AppError || (error.statusCode && statusCode < 500) ? error.code : undefined;
  res.status(statusCode).json({
    requestId: req.requestId,
    code: publicCode,
    message: statusCode === 500
      ? 'Lỗi hệ thống nội bộ, vui lòng thử lại sau'
      : statusCode === 503
        ? 'Database tạm thời không sẵn sàng, vui lòng thử lại sau'
        : statusCode === 413
          ? 'Dữ liệu gửi lên vượt quá giới hạn cho phép'
          : statusCode === 400 && invalidJson
            ? 'Dữ liệu JSON không hợp lệ'
            : error.message,
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
