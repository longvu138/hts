const db = require("../../config/database");
const { createUuid } = require("../../utils/uuid");
const { getClientInfo } = require("../../utils/client-info");
const { parsePagination } = require("../../utils/pagination");

const positiveNumberEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const MAX_ACTIVE_SESSIONS_PER_USER = positiveNumberEnv(
  "MAX_ACTIVE_SESSIONS_PER_USER",
  10,
);

const parseDurationMs = (value = "1d") => {
  const match = String(value).trim().match(/^(\d+)\s*([smhd])$/i);
  if (!match) return 24 * 60 * 60 * 1000;
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * multipliers[match[2].toLowerCase()];
};

const createSession = async ({ req, userId, tokenVersion = 0, expiresIn }) => {
  // id is the JWT jti and never leaves the server; publicId is what admins see and revoke.
  const id = createUuid();
  const publicId = createUuid();
  const client = getClientInfo(req);
  const expiresAt = new Date(Date.now() + parseDurationMs(expiresIn));
  await db("auth_sessions").insert({
    id,
    public_id: publicId,
    user_id: userId,
    token_version: Number(tokenVersion || 0),
    ip_address: client.ipAddress,
    user_agent: client.userAgent,
    browser: client.browser,
    operating_system: client.os,
    device_type: client.deviceType,
    expires_at: expiresAt,
    last_seen_at: db.fn.now(),
  });
  const otherActiveSessions = await db("auth_sessions")
    .where({ user_id: userId })
    .whereNot({ id })
    .whereNull("revoked_at")
    .where("expires_at", ">", db.fn.now())
    .orderBy("last_seen_at", "desc")
    .orderBy("created_at", "desc")
    .select("id");
  const excessSessionIds = otherActiveSessions
    .slice(Math.max(0, MAX_ACTIVE_SESSIONS_PER_USER - 1))
    .map((session) => session.id);
  if (excessSessionIds.length) {
    await db("auth_sessions")
      .whereIn("id", excessSessionIds)
      .whereNull("revoked_at")
      .update({
        revoked_at: db.fn.now(),
        revoke_reason: "session_limit_exceeded",
      });
  }
  return { id, publicId, expiresAt, client };
};

const getActiveSessionWithUser = async (sessionId, userId) => {
  const row = await db("auth_sessions as session")
    .innerJoin("staff_members as auth_user", "auth_user.id", "session.user_id")
    .where({
      "session.id": sessionId,
      "session.user_id": userId,
    })
    .whereNull("session.revoked_at")
    .where("session.expires_at", ">", db.fn.now())
    .select(
      "session.*",
      "auth_user.id as auth_user_id",
      "auth_user.username as auth_username",
      "auth_user.must_change_password as auth_must_change_password",
      "auth_user.is_active as auth_is_active",
      "auth_user.token_version as auth_token_version",
    )
    .first();

  if (!row) return null;

  const {
    auth_user_id: authUserId,
    auth_username: username,
    auth_must_change_password: mustChangePassword,
    auth_is_active: isActive,
    auth_token_version: tokenVersion,
    ...session
  } = row;

  return {
    session,
    user: {
      id: authUserId,
      username,
      must_change_password: mustChangePassword,
      is_active: isActive,
      token_version: tokenVersion,
    },
  };
};

const touchSession = async (session) => {
  if (!session) return;
  const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeen < 5 * 60 * 1000) return;
  // Preserve expires_at for databases whose old schema added an implicit
  // ON UPDATE CURRENT_TIMESTAMP clause to the timestamp column.
  await db("auth_sessions").where({ id: session.id }).update({
    last_seen_at: db.fn.now(),
    expires_at: session.expires_at,
  });
};

// Hoạt động gần nhất của từng người dùng — lấy mốc mới nhất trong TẤT CẢ phiên (kể cả đã hết
// hạn/đã revoke), vì mục đích chỉ là biết lần cuối họ thực sự dùng hệ thống, không phải phiên
// nào còn hiệu lực. Dùng cho danh sách cán bộ, tránh vấn đề "Lần đăng nhập gần nhất" chỉ cập
// nhật lúc đăng nhập nên đứng yên suốt thời gian JWT còn hạn (VD cấu hình 30 ngày ở production).
const getLastSeenAtByUserIds = async (userIds = []) => {
  if (!userIds.length) return {};
  const rows = await db("auth_sessions")
    .whereIn("user_id", userIds)
    .groupBy("user_id")
    .select("user_id")
    .max("last_seen_at as last_seen_at");
  return Object.fromEntries(rows.map((row) => [row.user_id, row.last_seen_at]));
};

const revokeSession = async ({ sessionId, userId, revokedBy, reason = "logout" }) =>
  db("auth_sessions")
    .where({ id: sessionId, ...(userId ? { user_id: userId } : {}) })
    .whereNull("revoked_at")
    .update({ revoked_at: db.fn.now(), revoked_by: revokedBy || null, revoke_reason: reason });

const revokeAllSessions = async ({ userId, revokedBy, reason = "revoke_all", exceptSessionId, trx }) => {
  const client = trx || db;
  const query = client("auth_sessions").where({ user_id: userId }).whereNull("revoked_at");
  if (exceptSessionId) query.whereNot({ id: exceptSessionId });
  return query.update({ revoked_at: client.fn.now(), revoked_by: revokedBy || null, revoke_reason: reason });
};

const revokeSessionByPublicId = async ({ publicId, userId, revokedBy, reason }) =>
  db("auth_sessions")
    .where({ public_id: publicId, user_id: userId })
    .whereNull("revoked_at")
    .update({ revoked_at: db.fn.now(), revoked_by: revokedBy || null, revoke_reason: reason });

const listSessions = async (userId, options = {}) => {
  const { limit, offset } = parsePagination(options.query, { defaultLimit: 100 });
  const rows = await db("auth_sessions")
    .where({ user_id: userId })
    .orderByRaw(
      "CASE WHEN revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP THEN 0 ELSE 1 END ASC",
    )
    .orderBy("last_seen_at", "desc")
    .orderBy("public_id")
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({
    id: row.public_id,
    ipAddress: row.ip_address,
    browser: row.browser,
    operatingSystem: row.operating_system,
    deviceType: row.device_type,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    active: !row.revoked_at && new Date(row.expires_at).getTime() > Date.now(),
    current: row.id === options.currentSessionId,
  }));
};

module.exports = {
  createSession,
  getActiveSessionWithUser,
  getLastSeenAtByUserIds,
  listSessions,
  revokeAllSessions,
  revokeSession,
  revokeSessionByPublicId,
  touchSession,
};
