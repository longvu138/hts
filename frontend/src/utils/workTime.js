import dayjs from "dayjs";

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

export const localInput = (value = new Date()) => {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
  return parts.replace(" ", "T");
};

export const today = () => localInput().slice(0, 10);

// Current Vietnam time floored to the minute step, so the default "at" stays stable between renders.
export const nowInput = (step = 15) => {
  const value = localInput();
  const minutes = Number(value.slice(14, 16));
  return `${value.slice(0, 14)}${String(minutes - (minutes % step)).padStart(2, "0")}`;
};

export const apiTime = (value) => `${value}:00+07:00`;

// Start of a Vietnam calendar day as an API instant.
export const dayStart = (date) => apiTime(`${date}T00:00`);

export const nextDate = (date, days = 1) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// End of a Vietnam calendar day as an exclusive API instant (= start of the next day).
export const dayEnd = (date) => dayStart(nextDate(date));

// Monday of the week containing `date` (YYYY-MM-DD); weeks run Monday–Sunday.
export const weekStart = (date) => nextDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

// Longest list range (in days between from and to) the filters accept.
export const WORK_MAX_RANGE_DAYS = 365;
export const rangeTooLong = (from, to) => Math.abs(daysBetween(from, to)) > WORK_MAX_RANGE_DAYS;

const validDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

export const showTime = (value) => {
  const date = validDate(value);
  return date
    ? new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
};

export const showClock = (value) => {
  const date = validDate(value);
  return date ? date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: VN_TIME_ZONE }) : "—";
};

export const showDate = (value) => {
  const date = validDate(value);
  return date ? date.toLocaleDateString("vi-VN", { timeZone: VN_TIME_ZONE }) : "—";
};

// "08:00 – 11:30" with the day (and end day if different), used by table, cards and drawer.
export const timeRangeParts = (startsAt, endsAt) => {
  if (!validDate(startsAt) || !validDate(endsAt)) return null;
  const startDay = showDate(startsAt);
  const endDay = showDate(endsAt);
  return {
    time: `${showClock(startsAt)} – ${showClock(endsAt)}`,
    day: startDay === endDay ? startDay : `${startDay} → ${endDay}`,
  };
};

export const showTimeRange = (startsAt, endsAt) => {
  const parts = timeRangeParts(startsAt, endsAt);
  return parts ? `${parts.time} · ${parts.day}` : "—";
};

// Compact "08:00 – 11:30" for calendar chips; adds "(DD/MM–DD/MM)" when the work spans days.
export const shortTimeRange = (startsAt, endsAt) => {
  const parts = timeRangeParts(startsAt, endsAt);
  if (!parts) return "—";
  const [start, end] = [localInput(startsAt), localInput(endsAt)].map((value) => value.slice(0, 10));
  const short = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
  return start === end ? parts.time : `${parts.time} (${short(start)}–${short(end)})`;
};

// "08:00–11:30" without spaces, used in short busy hints.
export const clockRange = (startsAt, endsAt) => `${showClock(startsAt)}–${showClock(endsAt)}`;

// Presets are resolved when clicked so an open page remains correct after midnight (UTC+7).
export const workDatePresets = () => {
  const current = () => dayjs(today());
  const monday = () => dayjs(weekStart(today()));
  return [
    { label: "Hôm nay", value: () => [current(), current()] },
    { label: "Ngày mai", value: () => [current().add(1, "day"), current().add(1, "day")] },
    { label: "Tuần này", value: () => [monday(), monday().add(6, "day")] },
    { label: "Tuần sau", value: () => [monday().add(7, "day"), monday().add(13, "day")] },
    { label: "Hôm qua", value: () => [current().subtract(1, "day"), current().subtract(1, "day")] },
    { label: "Tuần trước", value: () => [monday().subtract(7, "day"), monday().subtract(1, "day")] },
    { label: "Tháng này", value: () => [current().startOf("month"), current().endOf("month").startOf("day")] },
  ];
};
