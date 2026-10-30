import { httpClient } from "./httpClient";

const records = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];

const parseObject = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// History snapshots are stored as raw snake_case rows; expose a small camelCase shape to the UI.
const historySnapshot = (value) => {
  const raw = parseObject(value);
  const snapshot = {
    startsAt: raw.startsAt ?? raw.starts_at,
    endsAt: raw.endsAt ?? raw.ends_at,
    place: raw.place,
    content: raw.content,
    title: raw.title,
    description: raw.description,
    assigneeId: raw.assigneeId ?? raw.assignee_id,
    status: raw.status,
    note: raw.note,
    childIds: Array.isArray(raw.childIds) ? raw.childIds : undefined,
  };
  return Object.fromEntries(Object.entries(snapshot).filter(([, item]) => item !== undefined && item !== null));
};

const historyEntries = (value) => records(value).map((entry) => ({
  ...entry,
  before: historySnapshot(entry.before),
  after: historySnapshot(entry.after),
}));

const collection = (data) => ({
  items: records(data?.items).map((item) => ({
    ...item,
    ...(Object.hasOwn(item, "assignments") ? { assignments: records(item.assignments) } : {}),
  })),
  pagination: { page: 1, limit: 20, total: 0, ...data?.pagination },
  historyPagination: { page: 1, limit: 20, total: 0, ...data?.historyPagination },
  history: historyEntries(data?.history),
});

export const workApi = {
  availability: async (body) => {
    const { data } = await httpClient.post("/work-assignments/availability", body);
    return { conflicts: records(data?.conflicts), hasMore: Boolean(data?.hasMore) };
  },
  departments: async (params) => collection((await httpClient.get("/work-schedule/departments", { params })).data),
  list: async (params) => collection((await httpClient.get("/work-assignments", { params })).data),
  detail: async (id, params) => collection((await httpClient.get(`/work-assignments/${id}`, { params })).data),
  recipients: async (params) => collection((await httpClient.get("/work-assignments/recipients", { params })).data),
  schedule: async (params) => collection((await httpClient.get("/work-schedule", { params })).data),
  create: async (body) => (await httpClient.post("/work-assignments", body)).data,
  updateInfo: async (id, body) => (await httpClient.patch(`/work-assignments/${id}`, body)).data,
  action: async (action, id, body) => (await (action === "edit"
    ? httpClient.patch(`/work-parts/${id}`, body)
    : httpClient.post(`/work-parts/${id}/${action}`, body))).data,
};
