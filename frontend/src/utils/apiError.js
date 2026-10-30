export const SERVER_ERROR_MESSAGE = "Hệ thống đang gặp sự cố, vui lòng thử lại sau ít phút.";
export const NETWORK_ERROR_MESSAGE = "Không kết nối được máy chủ, vui lòng kiểm tra mạng và thử lại.";

const readHeader = (headers, name) => {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
};

/** Mã tra cứu: header X-Request-Id, body.requestId, hoặc mã client đã gửi kèm request. */
export const getApiRequestId = (error) => {
  const value =
    error?.requestId ||
    readHeader(error?.response?.headers, "x-request-id") ||
    error?.response?.data?.requestId ||
    readHeader(error?.config?.headers, "X-Request-Id");
  return typeof value === "string" ? value.slice(0, 128) : "";
};

export const isServerError = (error) => {
  const status = Number(error?.response?.status || 0);
  return status >= 500;
};

/** Thông điệp thân thiện cho người dùng: 5xx/mất mạng dùng câu chung, 4xx dùng message tiếng Việt của backend. */
export const getApiErrorMessage = (error, fallback = "Vui lòng kiểm tra kết nối và thử lại.") => {
  if (!error) return fallback;
  if (isServerError(error)) return SERVER_ERROR_MESSAGE;
  if (error?.isAxiosError && !error.response) return NETWORK_ERROR_MESSAGE;
  const message = error?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
};
