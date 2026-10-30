require('dotenv').config({ quiet: true });

const { UTC_CONNECTION_OPTIONS, afterCreate } = require('./src/config/mysql-connection');

const numberEnv = (name, fallback) => {
  const value = process.env[name];
  return value !== undefined && value !== '' ? Number(value) : fallback;
};

const boundedNumberEnv = (name, fallback, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, numberEnv(name, fallback)));

const baseConnection = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: numberEnv('DB_PORT', 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hts',
  charset: 'utf8mb4',
  ...UTC_CONNECTION_OPTIONS,
  connectTimeout: numberEnv('DB_CONNECT_TIMEOUT_MS', 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: numberEnv('DB_KEEPALIVE_INITIAL_DELAY_MS', 0),
};

const basePool = {
  min: boundedNumberEnv('DB_POOL_MIN', 0, 0, 1),
  idleTimeoutMillis: numberEnv('DB_POOL_IDLE_TIMEOUT_MS', 30000),
  acquireTimeoutMillis: numberEnv('DB_POOL_ACQUIRE_TIMEOUT_MS', 30000),
  createTimeoutMillis: numberEnv('DB_POOL_CREATE_TIMEOUT_MS', 30000),
  reapIntervalMillis: numberEnv('DB_POOL_REAP_INTERVAL_MS', 1000),
  afterCreate,
};

const baseKnexConfig = {
  client: 'mysql2',
  connection: baseConnection,
  acquireConnectionTimeout: numberEnv('DB_POOL_ACQUIRE_TIMEOUT_MS', 30000),
  asyncStackTraces: process.env.NODE_ENV !== 'production',
};

module.exports = {
  development: {
    ...baseKnexConfig,
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
    },
    pool: {
      ...basePool,
      max: boundedNumberEnv('DB_POOL_MAX', 3, 1, 4),
    },
  },
  production: {
    ...baseKnexConfig,
    migrations: {
      directory: './src/database/migrations',
      tableName: 'knex_migrations',
    },
    pool: {
      ...basePool,
      max: boundedNumberEnv('DB_POOL_MAX', 3, 1, 4),
    },
  },
};
