require('dotenv').config({ quiet: true });

const logger = require('../utils/logger');
const { assertSecuritySecrets } = require('../config/security');

// Refuse to start production with missing/weak/placeholder secrets; only warn locally.
try {
  const problems = assertSecuritySecrets();
  if (problems.length) logger.warn({ event: 'security_config_weak', problems });
} catch (error) {
  logger.error({ event: 'security_config_invalid', message: error.message });
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exit(1);
}

const app = require('./application');
const db = require('../config/database');
const { resolveListenTarget } = require('./listen-target');

// Passenger trên shared hosting có thể cấp PORT dưới dạng Unix socket.
// Chỉ ép kiểu khi đây thực sự là một cổng TCP dạng số.
const listenTarget = resolveListenTarget(process.env.PORT);

const server = app.listen(listenTarget, () => {
  logger.info(`Server listening on ${listenTarget}`);
});

let shuttingDown = false;
const shutdown = (signal, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received. Shutting down server.`);
  const forceExitTimer = setTimeout(() => {
    logger.error({ event: 'forced_shutdown', signal });
    process.exit(exitCode || 1);
  }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000));
  forceExitTimer.unref();
  server.close(async () => {
    try {
      await db.destroy();
      logger.info('Database pool closed.');
    } catch (error) {
      logger.error({
        event: 'database_pool_close_failed',
        message: error.message,
        stack: error.stack,
      });
    }
    logger.info('Server closed.');
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error({
    event: 'uncaught_exception',
    message: error.message,
    stack: error.stack,
  });
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({
    event: 'unhandled_rejection',
    message: reason?.message || String(reason),
    stack: reason?.stack,
    promise: String(promise),
  });
  shutdown('unhandledRejection', 1);
});
