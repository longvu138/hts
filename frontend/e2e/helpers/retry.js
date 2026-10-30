const TRANSIENT_NETWORK_ERRORS = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
]);

const isTransientNetworkError = (error) => {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return [...TRANSIENT_NETWORK_ERRORS].some((code) => text.includes(code));
};

export const withNetworkRetry = async (operation, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
};
