const path = require('path');
const fs = require('fs');
const winston = require('winston');
require('winston-daily-rotate-file');

const { sanitizeForLog } = require('./sanitize-log');

const logDir = path.resolve(__dirname, '../../logs');
fs.mkdirSync(logDir, { recursive: true });

const normalizeMessage = winston.format((info) => {
  if (
    info.message &&
    typeof info.message === 'object' &&
    !(info.message instanceof Error) &&
    !Array.isArray(info.message)
  ) {
    const messagePayload = info.message;
    return {
      ...info,
      ...messagePayload,
      message: messagePayload.message || messagePayload.event || 'log_event',
    };
  }

  if (info instanceof Error) {
    return {
      ...info,
      message: info.message,
      stack: info.stack,
      name: info.name,
    };
  }

  if (info.message instanceof Error) {
    const error = info.message;
    return {
      ...info,
      message: error.message,
      stack: error.stack,
      name: error.name,
    };
  }

  return info;
});

const redactSensitiveFields = winston.format((info) => {
  const sanitizedInfo = sanitizeForLog(info);
  Object.keys(info).forEach((key) => {
    delete info[key];
  });
  Object.assign(info, sanitizedInfo);
  return info;
});

const filterBy = (predicate) =>
  winston.format((info) => (predicate(info) ? info : false));

const accessOnly = filterBy((info) => info.event === 'http_request');
const auditOnly = filterBy((info) => Boolean(info.event) && !['http_request', 'request_error'].includes(info.event));
const warnOnly = filterBy((info) => info.level === 'warn');
const errorOnly = filterBy((info) => info.level === 'error');

const consoleFormat = winston.format.printf((info) => {
  const { timestamp, level, message, stack, event, requestId, ...meta } = info;
  const eventText = event ? ` ${event}` : '';
  const requestText = requestId ? ` requestId=${requestId}` : '';
  const metaText = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]${eventText}${requestText}: ${stack || message}${metaText}`;
});

const baseFormat = winston.format.combine(
  normalizeMessage(),
  redactSensitiveFields(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: baseFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'hts-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat,
      ),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_RETENTION || '30d',
      format: winston.format.combine(errorOnly(), winston.format.json()),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'warn-%DATE%.log'),
      level: 'warn',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_RETENTION || '30d',
      format: winston.format.combine(warnOnly(), winston.format.json()),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_RETENTION || '30d',
      format: winston.format.combine(accessOnly(), winston.format.json()),
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'audit-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_RETENTION || '30d',
      format: winston.format.combine(auditOnly(), winston.format.json()),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_RETENTION || '30d',
      format: winston.format.json(),
    }),
  ],
});

logger.logDir = logDir;

module.exports = logger;
