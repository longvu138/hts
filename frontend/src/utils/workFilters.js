import { WORK_DEFAULT_PAGE_SIZE, WORK_STATUS_VALUES } from "../constants/workOptions.js";
import { apiTime, dayEnd, dayStart, nowInput, rangeTooLong, today } from "./workTime.js";

const uuid = (value) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value || "");
const dateValue = (value) => {
  if (!/^(?:20\d{2}|2100)-\d{2}-\d{2}$/.test(value || "")) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};
const positiveInteger = (value, fallback, max = 100000) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= max ? number : fallback;
};

// Defaults are resolved on every read, so "today" never freezes at mount time.
export const workFilterDefaults = () => ({ from: today(), to: today(), at: nowInput() });

export const readWorkFilters = (params, {
  canView,
  canAssign = false,
  canPeople,
  defaults = workFilterDefaults(),
  pageSizes = [WORK_DEFAULT_PAGE_SIZE],
}) => {
  const mode = params.get("view") === "situation" && canView ? "situation" : params.get("view") === "given" && canAssign ? "given" : "mine";
  const from = dateValue(params.get("from")) || defaults.from;
  const candidate = dateValue(params.get("to")) || from;
  const to = candidate >= from && !rangeTooLong(from, candidate) ? candidate : from;
  const time = params.get("at") || "";
  const validAt = dateValue(time.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
  const status = params.get("status");
  const pageSize = Number(params.get("pageSize"));
  return {
    mode,
    from,
    to,
    at: validAt ? time : defaults.at,
    q: mode === "situation" ? "" : (params.get("q") || "").slice(0, 200),
    status: WORK_STATUS_VALUES.includes(status) ? status : undefined,
    place: (params.get("place") || "").slice(0, 200),
    assigneeId: ((mode === "given" && canPeople) || (mode === "situation" && canView)) && uuid(params.get("assigneeId")) ? params.get("assigneeId") : undefined,
    departmentId: mode === "situation" && uuid(params.get("departmentId")) ? params.get("departmentId") : undefined,
    page: positiveInteger(params.get("page"), 1),
    pageSize: pageSizes.includes(pageSize) ? pageSize : pageSizes[0],
  };
};

// Count of optional filters (search, status, person, place, unit) shown on the "Lọc thêm" toggle.
// In "Lịch đơn vị" the person select sits in the toolbar, so it is not counted there.
export const activeWorkFilterCount = (filters = {}) =>
  [filters.q, filters.mode === "situation" ? filters.place : filters.status, filters.mode === "situation" ? undefined : filters.assigneeId, filters.departmentId]
    .filter((value) => typeof value === "string" ? value.trim() : Boolean(value)).length;

export const patchWorkFilters = (previous, patch, { defaultPageSize = WORK_DEFAULT_PAGE_SIZE } = {}) => {
  const next = new URLSearchParams(previous);
  for (const [key, value] of Object.entries(patch)) {
    const isDefault = (key === "page" && value === 1) || (key === "view" && value === "mine") || (key === "pageSize" && value === defaultPageSize);
    if (value === undefined || value === null || value === "" || isDefault) next.delete(key);
    else next.set(key, String(value));
  }
  return next;
};

// API params for the current filters; list ranges are whole Vietnam days [from, to + 1).
export const workQueryParams = (filters, { q, place, canFilterPeople }) => filters.mode === "situation"
  ? { assigneeId: filters.assigneeId, at: apiTime(filters.at), q: q || undefined, place: place || undefined, departmentId: filters.departmentId, page: filters.page, limit: filters.pageSize }
  : {
    from: dayStart(filters.from),
    to: dayEnd(filters.to),
    q: q || undefined,
    status: filters.status,
    assigneeId: canFilterPeople ? filters.assigneeId : undefined,
    page: filters.page,
    limit: filters.pageSize,
  };

export const lastPage = (total, pageSize) => Math.max(1, Math.ceil(Number(total || 0) / Math.max(1, pageSize)));

export const createdWorkIsHidden = (body, filters, userId) => {
  const segment = body?.segments?.[0];
  if (!segment) return true;
  if (filters.mode === "situation" || filters.page > 1) return true;
  if (filters.mode === "mine" && !segment.assigneeIds.includes(userId)) return true;
  if (filters.assigneeId && !segment.assigneeIds.includes(filters.assigneeId)) return true;
  if (filters.status && filters.status !== "assigned") return true;
  if (filters.q && !body.title.toLocaleLowerCase("vi").includes(filters.q.trim().toLocaleLowerCase("vi"))) return true;
  return Date.parse(segment.startsAt) >= Date.parse(dayEnd(filters.to))
    || Date.parse(segment.endsAt) <= Date.parse(dayStart(filters.from));
};
