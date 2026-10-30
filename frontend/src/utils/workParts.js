// A part the viewer forwarded no longer holds their time, so it reads "Đã chuyển cho người khác".
export const isForwardedByMe = (item, userId) => Boolean(userId) && item?.status === "transferred" && item?.assigneeId === userId;

export const workPartTitle = (item) => item?.content || item?.title || "Công việc";

// "Giao bởi …" is noise in "Việc tôi đã giao" and when the viewer gave the work themselves.
export const showGiverOf = (item, { mode, userId } = {}) => mode !== "given" && item?.source !== "self" && item?.giverId !== userId;

// Which row actions the viewer may run on a part (mirrors backend rules; server still re-checks).
export const workPartActions = (item = {}, { userId, canAssign = false, canSelf = false } = {}) => {
  const mine = item.assigneeId === userId;
  const open = item.status === "assigned";
  const manages = item.giverId === userId && (canAssign || (canSelf && item.source === "self" && mine));
  return {
    complete: open && mine,
    transfer: canAssign && open && mine,
    edit: manages && open,
    cancel: manages && ["assigned", "transferred"].includes(item.status),
  };
};

// Summary strip for "Tình hình": counts from the rows currently loaded.
export const situationCounts = (items = []) => {
  const counts = { scheduled: 0, free: 0, completed: 0 };
  for (const item of Array.isArray(items) ? items : []) if (item && Object.hasOwn(counts, item.status)) counts[item.status] += 1;
  return counts;
};

const HISTORY_ORDER = { created: 0, transferred: 1, received: 2 };
const historyRank = (entry) => HISTORY_ORDER[entry?.action] ?? 3;
// Oldest first. Same-instant events: "chuyển" before "nhận", then reverse the server's newest-first order.
export const sortHistory = (history = []) => (Array.isArray(history) ? history : [])
  .map((entry, index) => ({ entry, index, time: Date.parse(entry?.createdAt) }))
  .sort((a, b) => (Number.isFinite(a.time) ? a.time : 0) - (Number.isFinite(b.time) ? b.time : 0)
    || historyRank(a.entry) - historyRank(b.entry)
    || b.index - a.index)
  .map(({ entry }) => entry);
