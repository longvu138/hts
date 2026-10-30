export const WORK_PERIODS = [
  { value: "morning", label: "Buổi sáng", start: "08:00", end: "11:30" },
  { value: "afternoon", label: "Buổi chiều", start: "13:30", end: "17:00" },
  { value: "day", label: "Cả ngày", start: "08:00", end: "17:00" },
  { value: "custom", label: "Tùy chọn" },
];

// Single source for part status labels/colors (table, card, drawer and filter options).
export const WORK_STATUS = Object.freeze({
  assigned: { label: "Chưa hoàn thành", color: "blue" },
  completed: { label: "Đã hoàn thành", color: "green" },
  transferred: { label: "Đã chuyển", color: "gold" },
  cancelled: { label: "Đã hủy", color: "default" },
});

export const WORK_STATUS_VALUES = Object.freeze(Object.keys(WORK_STATUS));

// Label shown to the assignee for a part they forwarded: it no longer holds their time.
export const WORK_FORWARDED_LABEL = "Đã chuyển cho người khác";

export const WORK_SITUATION_STATUS = Object.freeze({
  scheduled: { label: "Theo lịch", color: "blue" },
  completed: { label: "Đã hoàn thành", color: "green" },
  free: { label: "Chưa có lịch", color: "default" },
});

export const WORK_HISTORY_LABELS = Object.freeze({
  created: "Giao việc",
  received: "Nhận việc chuyển",
  updated: "Sửa lịch",
  info_updated: "Sửa thông tin",
  transferred: "Chuyển việc",
  cancelled: "Hủy việc",
  completed: "Hoàn thành",
});

// short: label for the compact view switch on phones/tablets.
export const WORK_VIEWS = Object.freeze([
  { value: "mine", label: "Việc của tôi", short: "Của tôi" },
  { value: "given", label: "Việc tôi đã giao", short: "Đã giao", requiresAssign: true },
  { value: "situation", label: "Lịch đơn vị", short: "Đơn vị", requiresView: true },
]);

export const WORK_ERROR_CODES = Object.freeze({
  PAST_CONFIRMATION_REQUIRED: "WORK_PAST_CONFIRMATION_REQUIRED",
  VERSION_CONFLICT: "WORK_VERSION_CONFLICT",
  // Part already completed/transferred/cancelled by someone else (409).
  STATE_CONFLICT: "WORK_STATE_CONFLICT",
});

export const WORK_MINUTE_STEP = 15;
export const WORK_DATE_FORMAT = "DD/MM/YYYY";
export const WORK_TIME_FORMAT = "HH:mm";
export const WORK_DEFAULT_PAGE_SIZE = 25;

// Ant Design `xl` (1200px): desktop table/filter row from here up (mobile query lives in hooks/useMediaQuery).
export const WORK_DESKTOP_MEDIA_QUERY = "(min-width: 1200px)";
