const resolveListenTarget = (value, fallback = 3108) => {
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return fallback;
  if (/^\d+$/.test(rawValue)) return Number(rawValue);
  return rawValue;
};

module.exports = { resolveListenTarget };
