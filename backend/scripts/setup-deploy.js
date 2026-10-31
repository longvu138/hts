// One-time setup, run from the backend image with the deployment folder mounted at /deploy.
// Does not connect to MySQL, start containers, or print passwords.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

function setupDeploy(directory, namespace, tag) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(namespace || '')) throw new Error('Tên Docker Hub không hợp lệ');
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag || '')) throw new Error('Phiên bản image không hợp lệ');
  const config = path.join(directory, '.env');
  if (fs.existsSync(config)) throw new Error('Đã có .env; giữ nguyên cấu hình. Để cập nhật, chỉ đổi HTS_IMAGE_TAG trong .env');
  const data = path.join(directory, 'data');
  const mysql = path.join(data, 'mysql');
  if (fs.existsSync(mysql) && fs.readdirSync(mysql).length) throw new Error('Đã có dữ liệu MySQL nhưng thiếu .env. Hãy khôi phục .env cũ, không tạo khóa mới');
  const secret = () => randomBytes(32).toString('hex');
  const content = [
    '# Cấu hình riêng: không đưa lên Git, không xóa khi cập nhật.',
    'COMPOSE_PROJECT_NAME=hts',
    `HTS_IMAGE_NAMESPACE=${namespace}`, `HTS_IMAGE_TAG=${tag}`,
    '# Local: http://localhost:3180; server: http://IP_SERVER:3180',
    'HTTP_PORT=3180', 'HTTPS_PORT=3443', 'HTS_DATA_DIR=./data',
    'MYSQL_DATABASE=hts', 'MYSQL_USER=hts',
    `MYSQL_PASSWORD=${secret()}`, `MYSQL_ROOT_PASSWORD=${secret()}`,
    `JWT_SECRET=${secret()}`, `CSRF_SECRET=${secret()}`,
    '# Token chỉ dùng cho API tạo admin đầu tiên; có thể xóa sau khi khởi tạo.',
    `BOOTSTRAP_TOKEN=${secret()}`,
    '# HTTPS cấu hình sau; mặc định HTTP không cần IP/tên miền.',
    'HTS_SITE_ADDRESS=:80', 'PUBLIC_ORIGIN=', 'AUTH_COOKIE_SECURE=false',
    'CORS_ALLOW_SAME_ORIGIN=true', 'ACME_EMAIL=admin@example.com', '',
  ].join('\n');
  for (const name of ['mysql', 'logs', 'backups', 'caddy/data', 'caddy/config']) {
    fs.mkdirSync(path.join(data, name), { recursive: true, mode: 0o750 });
  }
  // Backend image runs as node (uid 1000); prepare its bind mount before startup.
  if (process.getuid?.() === 0) {
    fs.chownSync(path.join(data, 'logs'), 1000, 1000);
    fs.chmodSync(path.join(data, 'logs'), 0o750);
  }
  fs.chmodSync(path.join(data, 'backups'), 0o700);
  fs.writeFileSync(config, content, { flag: 'wx', mode: 0o600 });
  return config;
}

if (require.main === module) {
  try {
    setupDeploy('/deploy', process.argv[2], process.argv[3]);
    console.log('Đã tạo .env và data/. Tiếp theo: docker compose up -d --wait');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { setupDeploy };
