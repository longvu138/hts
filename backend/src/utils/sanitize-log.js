const SENSITIVE_KEY_PATTERN =
  /password|passcode|token|secret|authorization|cookie|jwt|credential|private|vapid/i;

// Web Push subscription keys are short names that the pattern above cannot match safely.
const SENSITIVE_EXACT_KEYS = new Set(['auth', 'p256dh', 'keys', 'endpoint', 'jti']);

const isSensitiveKey = (key) => SENSITIVE_KEY_PATTERN.test(key) || SENSITIVE_EXACT_KEYS.has(String(key).toLowerCase());

const MAX_STRING_LENGTH = 1000;
const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 20;

const sanitizeForLog = (value, depth = 0, seen = new WeakSet(), key = '') => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (key === 'stack') {
      return value;
    }

    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= MAX_DEPTH) {
    return '[MaxDepth]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForLog(item, depth + 1, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      isSensitiveKey(key) ? '[REDACTED]' : sanitizeForLog(entryValue, depth + 1, seen, key),
    ]),
  );
};

module.exports = {
  sanitizeForLog,
};
