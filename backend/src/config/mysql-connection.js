const logger = require("../utils/logger");

const SOCKET_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
]);

const isSocketError = (error) => {
  return SOCKET_ERROR_CODES.has(error?.code) || error?.message?.includes("ETIMEDOUT");
};

const attachConnectionErrorHandler = (connection) => {
  let handled = false;

  const handleError = (error) => {
    if (handled) return;
    handled = true;

    logger.warn({
      event: "database_connection_error",
      message: error.message,
      code: error.code,
      errno: error.errno,
      fatal: error.fatal,
      stack: error.stack,
    });

    if (isSocketError(error)) {
      try {
        connection.destroy();
      } catch (destroyError) {
        logger.warn({
          event: "database_connection_destroy_failed",
          message: destroyError.message,
          stack: destroyError.stack,
        });
      }
    }
  };

  connection.on("error", handleError);
  connection.stream?.on("error", handleError);
};

// mysql2 must read/write Date values as UTC ("Z") and every session must run in UTC, so
// TIMESTAMP, DATETIME and NOW() agree regardless of the OS or MySQL server timezone.
const UTC_CONNECTION_OPTIONS = Object.freeze({ timezone: "Z" });

const afterCreate = (connection, done) => {
  attachConnectionErrorHandler(connection);
  connection.query("SET time_zone = '+00:00'", (error) => done(error || null, connection));
};

module.exports = {
  UTC_CONNECTION_OPTIONS,
  afterCreate,
  isSocketError,
};
