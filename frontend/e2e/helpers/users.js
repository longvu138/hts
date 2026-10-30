export const USER_KEYS = ["superadmin", "manager", "leader", "staff"];

const parseUsers = () => {
  const raw = process.env.E2E_USERS_JSON;
  let users = {};

  if (raw) {
    try {
      users = JSON.parse(raw);
    } catch (error) {
      throw new Error(`E2E_USERS_JSON is not valid JSON: ${error.message}`, {
        cause: error,
      });
    }
  }

  if (!users.superadmin && process.env.E2E_USERNAME && process.env.E2E_PASSWORD) {
    users.superadmin = {
      username: process.env.E2E_USERNAME,
      password: process.env.E2E_PASSWORD,
    };
  }

  return users;
};

export const E2E_USERS = parseUsers();

export const getUserCredential = (key) => E2E_USERS[key] || null;

export const hasUserCredential = (key) => {
  const credential = getUserCredential(key);
  return Boolean(credential?.username && credential?.password);
};

export const missingCredentialReason = (key) =>
  `Thiếu credential cho "${key}". Thêm user này vào E2E_USERS_JSON để chạy kịch bản.`;

export const availableUserKeys = () =>
  USER_KEYS.filter((key) => hasUserCredential(key));
