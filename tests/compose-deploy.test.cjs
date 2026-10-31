const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setupDeploy } = require('../backend/scripts/setup-deploy');
const { spawnSync } = require('node:child_process');

test('build/push đọc image trực tiếp từ file, hai image cùng tài khoản và phiên bản', t => {
  if (spawnSync('docker', ['compose', 'version']).status !== 0) return t.skip('Cần Docker Compose CLI');
  const result = spawnSync('docker', ['compose', '-f', 'compose.build.yaml', 'config', '--format', 'json'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, HTS_IMAGE_NAMESPACE: 'E2E_KHONG_DUNG', HTS_IMAGE_TAG: 'E2E_KHONG_DUNG', HTS_PLATFORM: 'E2E_KHONG_DUNG' },
  });
  assert.equal(result.status, 0, result.stderr);
  const { backend, web } = JSON.parse(result.stdout).services;
  const backendImage = backend.image.match(/^(.+)\/hts-backend:([^:]+)$/);
  const webImage = web.image.match(/^(.+)\/hts-web:([^:]+)$/);
  assert.ok(backendImage && webImage, 'Image phải có tài khoản Docker Hub, tên image và tag');
  assert.equal(backendImage[1], webImage[1], 'Hai image phải cùng tài khoản');
  assert.equal(backendImage[2], webImage[2], 'Hai image phải cùng phiên bản');
  assert.ok(!backend.image.includes('E2E_KHONG_DUNG'), 'Biến môi trường không ghi đè image đã sửa tay');
  for (const service of [backend, web]) {
    assert.equal(service.platform, undefined, 'Không ép kiến trúc chạy ở cấp service');
    assert.deepEqual([...service.build.platforms].sort(), ['linux/amd64', 'linux/arm64']);
  }
});

function folder(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'E2E_compose_')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
test('khởi tạo cấu hình riêng và thư mục dữ liệu, không ghi đè khóa cũ', t => {
  const directory = folder(t);
  const file = setupDeploy(directory, 'e2e', '1.0.0');
  const config = fs.readFileSync(file, 'utf8');
  const secrets = [...config.matchAll(/^(?:MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD|JWT_SECRET|CSRF_SECRET|BOOTSTRAP_TOKEN)=([a-f0-9]{64})$/gm)].map(match => match[1]);
  assert.equal(new Set(secrets).size, 5);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  for (const name of ['mysql', 'logs', 'backups', 'caddy/data', 'caddy/config']) assert.ok(fs.statSync(path.join(directory, 'data', name)).isDirectory());
  assert.throws(() => setupDeploy(directory, 'e2e', '1.0.1'), /Đã có .env/);
  assert.equal(fs.readFileSync(file, 'utf8'), config);
});
test('không tạo secret mới khi dữ liệu MySQL cũ mất cấu hình', t => {
  const directory = folder(t);
  fs.mkdirSync(path.join(directory, 'data/mysql'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'data/mysql/auto.cnf'), 'E2E');
  assert.throws(() => setupDeploy(directory, 'e2e', '1.0.0'), /khôi phục .env cũ/);
  assert.ok(!fs.existsSync(path.join(directory, '.env')));
});
test('từ chối tên image hoặc tag sai trước khi ghi cấu hình', t => {
  const directory = folder(t);
  for (const [namespace, tag] of [['e2e\nJWT_SECRET=x', '1.0'], ['e2e', 'tag\nPORT=80']]) assert.throws(() => setupDeploy(directory, namespace, tag), /không hợp lệ/);
  assert.ok(!fs.existsSync(path.join(directory, '.env')));
});

test('Compose giữ dữ liệu cạnh file cấu hình, migrate trước backend và chỉ public web', t => {
  if (spawnSync('docker', ['compose', 'version']).status !== 0) return t.skip('Cần Docker Compose CLI để kiểm tra config (không cần daemon)');
  const directory = folder(t);
  setupDeploy(directory, 'e2e', '1.0.0');
  fs.copyFileSync(path.join(__dirname, '../compose.yaml'), path.join(directory, 'compose.yaml'));
  const result = spawnSync('docker', ['compose', '--profile', 'tools', 'config', '--format', 'json'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const { services } = JSON.parse(result.stdout);
  assert.equal(services.backend.image, 'e2e/hts-backend:1.0.0');
  assert.match(services.backend.environment.BOOTSTRAP_TOKEN, /^[a-f0-9]{64}$/);
  assert.equal(services.web.image, 'e2e/hts-web:1.0.0');
  assert.equal(services.backend.depends_on.migrate.condition, 'service_completed_successfully');
  assert.equal(services.migrate.depends_on.db.condition, 'service_healthy');
  assert.equal(services.web.depends_on.backend.condition, 'service_healthy');
  for (const service of ['db', 'backend', 'migrate', 'backup']) assert.ok(!services[service].ports?.length);
  for (const service of Object.values(services)) assert.equal(service.platform, undefined, 'Máy triển khai tự chọn kiến trúc image');
  assert.equal(services.web.ports[0].published, '3180');
  for (const service of ['db', 'backend', 'web', 'backup']) {
    for (const mount of services[service].volumes) assert.ok(mount.source.startsWith(path.join(directory, 'data')) || mount.source === path.join(directory, '.env'));
  }
  assert.deepEqual(services.backup.profiles, ['tools']);
  assert.equal(services.backup.volumes.find(mount => mount.target === '/config/hts.env').read_only, true);
});
