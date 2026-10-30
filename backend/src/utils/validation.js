const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

const requireFields = (body, fieldsMap) => {
  const fields = Array.isArray(fieldsMap) ? fieldsMap : Object.keys(fieldsMap);
  const missing = fields.filter((field) => isBlank(body[field]));
  if (missing.length) {
    const names = Array.isArray(fieldsMap)
      ? missing.join(", ")
      : missing.map((f) => fieldsMap[f]).join(", ");
    return { error: `${names} là bắt buộc` };
  }
  return null;
};

const pickDefined = (body, fieldMap) => {
  const payload = {};
  Object.entries(fieldMap).forEach(([from, to]) => {
    if (body[from] === undefined) return;
    if (typeof to === "function") {
      Object.assign(payload, to(body[from], body));
      return;
    }
    payload[to] = body[from] === "" ? null : body[from];
  });
  return payload;
};

const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return String(value);
};

const toBooleanFlag = (value) => (value ? 1 : 0);

module.exports = {
  isBlank,
  normalizeOptionalString,
  pickDefined,
  requireFields,
  toBooleanFlag,
};
