const assert = require("node:assert/strict");
const test = require("node:test");

const loadKnexConfig = ({ max, min } = {}) => {
  const modulePath = require.resolve("./knexfile");
  delete require.cache[modulePath];
  if (max === undefined) delete process.env.DB_POOL_MAX;
  else process.env.DB_POOL_MAX = String(max);
  if (min === undefined) delete process.env.DB_POOL_MIN;
  else process.env.DB_POOL_MIN = String(min);
  return require(modulePath);
};

test("pool MySQL mặc định phù hợp shared hosting", () => {
  const config = loadKnexConfig();
  assert.equal(config.development.pool.min, 0);
  assert.equal(config.development.pool.max, 3);
  assert.equal(config.production.pool.max, 3);
  assert.equal(config.production.pool.idleTimeoutMillis, 30000);
});

test("pool MySQL không cho cấu hình vượt quá bốn kết nối", () => {
  const config = loadKnexConfig({ max: 99, min: 99 });
  assert.equal(config.development.pool.min, 1);
  assert.equal(config.development.pool.max, 4);
  assert.equal(config.production.pool.max, 4);
});

test("kết nối MySQL luôn dùng UTC, không phụ thuộc múi giờ máy chủ", () => {
  const config = loadKnexConfig();
  assert.equal(config.development.connection.timezone, "Z");
  assert.equal(config.production.connection.timezone, "Z");
  assert.equal(typeof config.production.pool.afterCreate, "function");
});
