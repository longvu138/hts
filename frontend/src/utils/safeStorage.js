const createSafeStorage = (resolveStorage) => ({
  getItem(key, fallback = null) {
    try {
      return resolveStorage()?.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },

  setItem(key, value) {
    try {
      resolveStorage()?.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  },

  removeItem(key) {
    try {
      resolveStorage()?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  getJSON(key, fallback) {
    const stored = this.getItem(key);
    if (stored === null) return fallback;

    try {
      return JSON.parse(stored);
    } catch {
      this.removeItem(key);
      return fallback;
    }
  },

  setJSON(key, value) {
    try {
      return this.setItem(key, JSON.stringify(value));
    } catch {
      return false;
    }
  },
});

const resolveWindowStorage = (name) => () => {
  if (typeof window === "undefined") return null;
  return window[name];
};

export const safeLocalStorage = createSafeStorage(
  resolveWindowStorage("localStorage"),
);

export const safeSessionStorage = createSafeStorage(
  resolveWindowStorage("sessionStorage"),
);

export { createSafeStorage };
