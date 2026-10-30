// Shared HTTP error type. Services throw these; the error middleware turns them into JSON.
class AppError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

const httpError = (statusCode, message, code) => new AppError(statusCode, message, code);
const fail = (statusCode, message, code) => {
  throw new AppError(statusCode, message, code);
};

module.exports = {
  AppError,
  httpError,
  fail,
  badRequest: (message, code) => new AppError(400, message, code),
  forbidden: (message, code) => new AppError(403, message, code),
  notFound: (message, code) => new AppError(404, message, code),
  conflict: (message, code) => new AppError(409, message, code),
  unprocessable: (message, code) => new AppError(422, message, code),
};
