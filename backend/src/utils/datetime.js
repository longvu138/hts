// The database session runs in UTC (see config/mysql-connection.js), so every value is UTC.
const toDate = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const text = String(value);
  // DATETIME literals without zone are UTC by convention.
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
};

// ISO-8601 UTC without milliseconds, e.g. 2026-10-24T01:00:00Z.
const toIsoUtc = (value) => {
  const date = toDate(value);
  return date ? `${date.toISOString().slice(0, 19)}Z` : null;
};

// MySQL DATETIME literal in UTC, e.g. 2026-10-24 01:00:00.
const toDbDateTime = (value = new Date()) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 19).replace("T", " ") : null;
};

const nowDb = () => toDbDateTime(new Date());

module.exports = { nowDb, toDate, toDbDateTime, toIsoUtc };
