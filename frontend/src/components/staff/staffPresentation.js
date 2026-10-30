export const formatSessionIp = (value) =>
  ["::1", "::ffff:127.0.0.1", "127.0.0.1"].includes(value)
    ? "Localhost"
    : value || "-";

export const getSessionStatus = (session) => {
  if (session.active) return { color: "green", label: "Đang hoạt động" };
  if (session.revokedAt) return { color: "red", label: "Đã thu hồi" };
  return { color: "default", label: "Đã hết hạn" };
};

