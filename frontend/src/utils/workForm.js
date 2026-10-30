import { WORK_PERIODS } from "../constants/workOptions.js";
import { apiTime, clockRange, dayEnd, dayStart, localInput, today } from "./workTime.js";
export const workFormInitial = (item, userId, defaultDate = today(), mode = item ? "edit" : "create") => {
  const start = item ? localInput(item.startsAt) : `${defaultDate}T08:00`;
  const end = item ? localInput(item.endsAt) : `${defaultDate}T11:30`;
  const period = start.slice(0, 10) === end.slice(0, 10) ? WORK_PERIODS.find(p => p.start === start.slice(11) && p.end === end.slice(11))?.value : null;
  return {
    name: item?.content || item?.title || "",
    date: start.slice(0, 10),
    endDate: end.slice(0, 10),
    period: period || "custom",
    startTime: start.slice(11),
    endTime: end.slice(11),
    place: item?.place || "",
    // Forwarding starts empty: keeping a share for yourself is an explicit, separate choice.
    assigneeIds: mode === "transfer" ? [] : item ? [item.assigneeId] : [userId],
    keepForMe: false,
    overnight: start.slice(0, 10) !== end.slice(0, 10),
    reason: ""
  };
};
export const workFormTimes = values => {
  const preset = WORK_PERIODS.find(p => p.value === values.period);
  const custom = values.period === "custom";
  return {
    startsAt: apiTime(`${values.date}T${custom ? values.startTime : preset.start}`),
    endsAt: apiTime(`${custom ? values.endDate : values.date}T${custom ? values.endTime : preset.end}`)
  };
};
// Forwarding: "Giữ một phần cho tôi" adds the forwarder as a co-worker (README: chọn thêm bản thân).
export const workAssigneeIds = (values, mode, userId) => {
  const ids = Array.isArray(values?.assigneeIds) ? values.assigneeIds.filter(id => id !== (mode === "transfer" ? userId : undefined)) : [];
  return mode === "transfer" && values?.keepForMe ? [...ids, userId] : ids;
};
export const workFormBody = (values, {
  mode,
  item,
  userId,
  canSelf
}) => {
  const self = mode === "create" && canSelf && values.assigneeIds?.length === 1 && values.assigneeIds[0] === userId;
  return {
    ...(mode === "create" ? {
      title: values.name.trim(),
      source: self ? "self" : "assigned"
    } : {
      version: item.version
    }),
    ...(mode === "transfer" ? {
      reason: values.reason
    } : {}),
    segments: [{
      content: values.name.trim(),
      place: values.place.trim(),
      assigneeIds: workAssigneeIds(values, mode, userId),
      ...workFormTimes(values)
    }]
  };
};

export const workAvailabilityBody = (values, { mode, item, userId, canSelf }) => {
  const assigneeIds = workAssigneeIds(values, mode, userId);
  if (!values?.date || !values.period || !assigneeIds.length || assigneeIds.length > 50) return null;
  try {
    const times = workFormTimes(values);
    const start = Date.parse(times.startsAt);
    const end = Date.parse(times.endsAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null;
    const self = canSelf && assigneeIds.length === 1 && assigneeIds[0] === userId;
    const source = mode === "transfer" ? "assigned" : mode === "edit" ? item.source : self ? "self" : "assigned";
    return { action: mode, source, ...(mode !== "create" ? { excludeAssignmentId: item.id } : {}), segments: [{ ...times, assigneeIds }] };
  } catch {
    return null;
  }
};

const preset = (value) => WORK_PERIODS.find((period) => period.value === value);
const overlaps = (item, start, end) => Date.parse(item?.startsAt) < end && start < Date.parse(item?.endsAt);
const idList = (ids) => (Array.isArray(ids) ? ids : [ids]).filter(Boolean);

// Probe covering every preset (08:00–17:00) for the chosen people. It picks a free default period
// and answers the preset previews, so opening the form costs one availability request.
export const workDayProbeBody = (date, assigneeIds, source = "self") => {
  const ids = idList(assigneeIds);
  if (!date || !ids.length || ids.length > 50) return null;
  return {
    action: "create",
    source,
    segments: [{ startsAt: apiTime(`${date}T${preset("morning").start}`), endsAt: apiTime(`${date}T${preset("day").end}`), assigneeIds: ids }],
  };
};

// True when `body` asks about a sub-range of the probe for the same people, so the probe already answers it.
export const probeCovers = (probeBody, body) => {
  const probe = probeBody?.segments?.[0];
  const segment = body?.segments?.length === 1 ? body.segments[0] : null;
  if (!probe || !segment || body.excludeAssignmentId || body.action !== probeBody.action || body.source !== probeBody.source) return false;
  const ids = new Set(probe.assigneeIds);
  if (!Array.isArray(segment.assigneeIds) || !segment.assigneeIds.length || !segment.assigneeIds.every((id) => ids.has(id))) return false;
  return Date.parse(probe.startsAt) <= Date.parse(segment.startsAt) && Date.parse(segment.endsAt) <= Date.parse(probe.endsAt);
};

// Conflicts of a probe that matter for one preview segment (same people, overlapping time).
export const conflictsWithin = (conflicts, segment) => {
  const ids = new Set(idList(segment?.assigneeIds));
  const start = Date.parse(segment?.startsAt);
  const end = Date.parse(segment?.endsAt);
  return (Array.isArray(conflicts) ? conflicts : []).filter((item) => item && ids.has(item.assigneeId) && overlaps(item, start, end));
};

// First preset that does not overlap anyone's existing slots; null when all presets are busy.
export const pickFreePeriod = (date, conflicts = []) => {
  const busy = (Array.isArray(conflicts) ? conflicts : []).filter((item) => Number.isFinite(Date.parse(item?.startsAt)) && Number.isFinite(Date.parse(item?.endsAt)));
  const free = WORK_PERIODS.filter((period) => period.start).find((period) => {
    const start = Date.parse(apiTime(`${date}T${period.start}`));
    const end = Date.parse(apiTime(`${date}T${period.end}`));
    return !busy.some((item) => overlaps(item, start, end));
  });
  return free?.value || null;
};

// Default period before the user touches the time: morning, unless every chosen person is busy
// then — in that case the first preset free for all of them (morning when none is free).
export const defaultPeriodFor = (date, assigneeIds, conflicts = []) => {
  const ids = idList(assigneeIds);
  const morning = preset("morning");
  const start = Date.parse(apiTime(`${date}T${morning.start}`));
  const end = Date.parse(apiTime(`${date}T${morning.end}`));
  const list = Array.isArray(conflicts) ? conflicts : [];
  const allBusy = ids.length > 0 && ids.every((id) => list.some((item) => item?.assigneeId === id && overlaps(item, start, end)));
  return allBusy ? pickFreePeriod(date, list) || "morning" : "morning";
};

// Whole-day lookup for the people listed in the recipient dropdown (busy hints per option).
export const workDayBusyBody = (date, assigneeIds, { mode, item } = {}) => {
  const ids = idList(assigneeIds).slice(0, 50);
  if (!date || !ids.length) return null;
  return {
    action: mode === "transfer" ? "transfer" : "create",
    source: "assigned",
    ...(mode === "transfer" && item?.id ? { excludeAssignmentId: item.id } : {}),
    segments: [{ startsAt: dayStart(date), endsAt: dayEnd(date), assigneeIds: ids }],
  };
};

// assigneeId -> "bận 08:00–11:30, 13:30–17:00" (at most two slots, then "…").
export const workBusyHints = (conflicts) => {
  const slots = new Map();
  for (const item of Array.isArray(conflicts) ? conflicts : []) {
    if (!item?.assigneeId || !Number.isFinite(Date.parse(item.startsAt)) || !Number.isFinite(Date.parse(item.endsAt))) continue;
    slots.set(item.assigneeId, [...(slots.get(item.assigneeId) || []), item]);
  }
  return new Map([...slots].map(([id, items]) => {
    const sorted = items.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    const shown = sorted.slice(0, 2).map((slot) => clockRange(slot.startsAt, slot.endsAt)).join(", ");
    return [id, `bận ${shown}${sorted.length > 2 ? ", …" : ""}`];
  }));
};

// On touch screens focusing the first invalid field pops the keyboard or a picker over the error text,
// so only scroll there; mouse/keyboard users still get focus moved to the field.
export const errorScrollOptions = (matchMedia = globalThis.window?.matchMedia) => ({
  focus: !(typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches),
  block: "center",
});

// ISO timestamps include their timezone, so comparison works regardless of the browser timezone.
export const hasPastWorkStart = (body, now = Date.now()) => (Array.isArray(body?.segments) ? body.segments : [])
  .some(segment => Date.parse(segment.startsAt) < now);
