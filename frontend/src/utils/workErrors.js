import { WORK_ERROR_CODES } from "../constants/workOptions.js";

// Decide by the server error code, not only HTTP status: some 403s may become 409 and some 409s 422.
export const workErrorCode = (error) => error?.response?.data?.code || error?.code || null;

// Stale data: the work changed (version) or the part already moved on (state). Offer close + reload.
export const isWorkVersionConflict = (error) => [WORK_ERROR_CODES.VERSION_CONFLICT, WORK_ERROR_CODES.STATE_CONFLICT].includes(workErrorCode(error));

// Any server-reported business error should refresh cached lists (state may have moved on).
export const shouldRefreshAfterWorkError = (error) => {
  const status = error?.response?.status;
  return isWorkVersionConflict(error) || [403, 404, 409, 422].includes(status);
};

export const workErrorMessage = (error, fallback = "Không lưu được, vui lòng thử lại") => {
  const message = error?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
};

// Load errors: show the server's explanation when present, else let QueryErrorState use its default.
export const workLoadErrorMessage = (error) => {
  const message = error?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : undefined;
};
