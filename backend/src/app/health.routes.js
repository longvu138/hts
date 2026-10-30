const express = require('express');
const db = require('../config/database');
const { isSocketError } = require('../config/mysql-connection');

const router = express.Router();

const checkDatabase = async () => {
  const startedAt = Date.now();
  await db.raw('SELECT 1');
  return {
    status: 'connected',
    responseTimeMs: Date.now() - startedAt,
  };
};

/**
 * GET /health
 * Dùng để kiểm tra backend và kết nối database còn hoạt động hay không.
 * Quyền: public.
 * Success 200: { status: "ok", database: "connected", timestamp }.
 * Fail: 500 hoặc lỗi middleware nếu database không kết nối được.
 */
router.get('/', async (req, res, next) => {
  try {
    const database = await checkDatabase();

    res.json({
      status: 'ok',
      database: database.status,
      databaseResponseTimeMs: database.responseTimeMs,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (error) {
    if (isSocketError(error)) error.statusCode = 503;
    next(error);
  }
});

/**
 * GET /health/db
 * Dùng cho hosting/monitor kiểm tra riêng kết nối database.
 * Success 200: { status: "ok", database: { status, responseTimeMs }, timestamp }.
 * Fail 503: database tạm thời không sẵn sàng.
 */
router.get('/db', async (req, res, next) => {
  try {
    const database = await checkDatabase();
    res.json({
      status: 'ok',
      database,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    error.statusCode = 503;
    next(error);
  }
});

module.exports = router;
