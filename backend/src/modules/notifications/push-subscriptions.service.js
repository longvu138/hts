const crypto = require("crypto");

const db = require("../../config/database");
const { createUuid } = require("../../utils/uuid");

const { httpError: createHttpError } = require("../../utils/http-error");

const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;
const MAX_ACTIVE_SUBSCRIPTIONS_PER_USER = 10;
// Only real browser push services; prevents using the server to call arbitrary URLs (SSRF).
const PUSH_HOST_PATTERNS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
];

const hashEndpoint = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex");

const isAllowedPushEndpoint = (endpoint) => {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
    && PUSH_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname.toLowerCase()));
};

const normalizeSubscription = (subscription) => {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || typeof endpoint !== "string") {
    throw createHttpError(422, "Thiếu endpoint đăng ký thông báo");
  }
  if (endpoint.length > MAX_ENDPOINT_LENGTH || !isAllowedPushEndpoint(endpoint)) {
    throw createHttpError(422, "Endpoint đăng ký thông báo không thuộc dịch vụ Web Push được hỗ trợ");
  }
  if (!p256dh || typeof p256dh !== "string" || !auth || typeof auth !== "string") {
    throw createHttpError(422, "Thiếu khóa đăng ký thông báo");
  }
  if (p256dh.length > MAX_KEY_LENGTH || auth.length > MAX_KEY_LENGTH || !/^[A-Za-z0-9_=-]+$/.test(p256dh) || !/^[A-Za-z0-9_=-]+$/.test(auth)) {
    throw createHttpError(422, "Khóa đăng ký thông báo không hợp lệ");
  }

  return { endpoint, p256dh, auth };
};

const mapSubscription = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
    userAgent: row.user_agent,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const upsertSubscription = async ({ userId, subscription, userAgent = null }) => {
  if (!userId) throw createHttpError(422, "Thiếu người dùng đăng ký thông báo");

  const normalized = normalizeSubscription(subscription);
  const endpointHash = hashEndpoint(normalized.endpoint);
  const existing = await db("push_subscriptions").where({ endpoint_hash: endpointHash }).first();

  // An endpoint registered by another account is never moved silently to this account.
  if (existing && existing.user_id !== userId) {
    throw createHttpError(409, "Thiết bị này đang nhận thông báo của tài khoản khác. Hãy tắt thông báo ở tài khoản đó trước");
  }

  if (!existing || existing.revoked_at) {
    const [{ total }] = await db("push_subscriptions")
      .where({ user_id: userId })
      .whereNull("revoked_at")
      .count({ total: "*" });
    if (Number(total) >= MAX_ACTIVE_SUBSCRIPTIONS_PER_USER) {
      throw createHttpError(422, `Mỗi tài khoản nhận thông báo trên tối đa ${MAX_ACTIVE_SUBSCRIPTIONS_PER_USER} thiết bị`);
    }
  }

  if (existing) {
    await db("push_subscriptions")
      .where({ id: existing.id })
      .update({
        user_id: userId,
        endpoint: normalized.endpoint,
        p256dh: normalized.p256dh,
        auth: normalized.auth,
        user_agent: userAgent,
        revoked_at: null,
        last_used_at: db.fn.now(),
      });
    return mapSubscription(await db("push_subscriptions").where({ id: existing.id }).first());
  }

  const id = createUuid();
  await db("push_subscriptions").insert({
    id,
    user_id: userId,
    endpoint: normalized.endpoint,
    endpoint_hash: endpointHash,
    p256dh: normalized.p256dh,
    auth: normalized.auth,
    user_agent: userAgent,
    last_used_at: db.fn.now(),
  });

  return mapSubscription(await db("push_subscriptions").where({ id }).first());
};

const revokeSubscription = async ({ userId, endpoint }) => {
  if (!userId) throw createHttpError(422, "Thiếu người dùng hủy thông báo");
  if (!endpoint || typeof endpoint !== "string") {
    throw createHttpError(422, "Thiếu endpoint hủy thông báo");
  }

  const updatedCount = await db("push_subscriptions")
    .where({ user_id: userId, endpoint_hash: hashEndpoint(endpoint) })
    .whereNull("revoked_at")
    .update({ revoked_at: db.fn.now() });

  return updatedCount;
};

const listActiveByUser = async (userId) =>
  db("push_subscriptions")
    .where({ user_id: userId })
    .whereNull("revoked_at")
    .select("id", "endpoint", "p256dh", "auth");

const markUsed = async (id) => {
  await db("push_subscriptions").where({ id }).update({ last_used_at: db.fn.now() });
};

const markRevoked = async (id) => {
  await db("push_subscriptions").where({ id }).update({ revoked_at: db.fn.now() });
};

module.exports = {
  isAllowedPushEndpoint,
  listActiveByUser,
  markRevoked,
  markUsed,
  revokeSubscription,
  upsertSubscription,
};
