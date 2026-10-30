export const workKeys = {
  all: ["work"],
  lists: () => ["work", "list"],
  list: (mode, params) => ["work", "list", mode, params],
  details: () => ["work", "detail"],
  detail: (id, page, historyPage) => ["work", "detail", id, page, historyPage],
  availabilityAll: () => ["work", "availability"],
  availability: (body) => ["work", "availability", body],
  recipients: (mode, search, id, actorId) => ["work", "recipients", actorId, mode, search, id],
  departments: (search) => ["work", "departments", search],
};
