const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { gzipSync, gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const password = 'E2E_"\\$()_mat_khau_2026';
const sql = 'CREATE TABLE E2E_backup (id int);\n';
const dockerMock = `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2),joined=args.join(' ');
fs.appendFileSync(process.env.MOCK_CALLS,JSON.stringify(args)+'\\n');
if(args.includes('config')&&process.env.MOCK_ACCESS)fs.writeFileSync(process.env.MOCK_ACCESS,JSON.stringify({site:process.env.HTS_SITE_ADDRESS,cookie:process.env.AUTH_COOKIE_NAME,secure:process.env.AUTH_COOKIE_SECURE,sameOrigin:process.env.CORS_ALLOW_SAME_ORIGIN}));
if(args[0]==='info')process.exit(process.env.MOCK_DOCKER_FAIL==='1'?1:0);
if(args[0]==='buildx')process.exit(process.env.MOCK_PUBLISH_FAIL==='1'&&args[1]==='build'?9:0);
if(args[0]!=='compose')process.exit(2);
if(process.env.MOCK_DRAIN_STDIN==='1'&&!joined.includes('scripts/bootstrap-admin.js')&&!joined.includes('exec mysql --user=root --default-character-set')&&args.some(arg=>['exec','run','up'].includes(arg)))fs.readFileSync(0);
if(args.includes('pull')&&process.env.MOCK_PULL_FAIL==='1')process.exit(9);
if(args.includes('run')&&args.includes('migrate')&&process.env.MOCK_MIGRATION_FAIL==='1')process.exit(9);
if(joined.includes('mysqldump')){if(process.env.MOCK_BACKUP_FAIL==='1')process.exit(9);process.stdout.write(${JSON.stringify(sql)});}
else if(joined.includes('information_schema.tables'))console.log(process.env.MOCK_TABLES||'0');
else if(joined.includes('administration_state'))console.log(process.env.MOCK_ADMIN_NEEDED||'yes');
else if(joined.includes('scripts/bootstrap-admin.js')){fs.writeFileSync(process.env.MOCK_CREDENTIALS,fs.readFileSync(0));if(process.env.MOCK_BOOTSTRAP_FAIL==='1')process.exit(9);}
else if(joined.includes('exec mysql --user=root --default-character-set'))fs.writeFileSync(process.env.MOCK_IMPORT,fs.readFileSync(0));
`;
function fixture(t, { existing = false, legacy = false } = {}) {
  const folder = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'E2E_hts_deploy_')));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const project = path.join(folder, 'source'), data = path.join(folder, 'data'), bin = path.join(folder, 'bin');
  fs.mkdirSync(path.join(project, 'deploy'), { recursive: true }); fs.mkdirSync(bin);
  for (const file of ['deploy.sh', 'compose.yaml', 'deploy/.env.example']) fs.copyFileSync(path.join(root, file), path.join(project, file));
  for (const [name, code] of Object.entries({ docker: dockerMock, id: '#!/bin/sh\necho 0\n', uname: '#!/bin/sh\necho Linux\n', chown: '#!/bin/sh\nexit 0\n' })) {
    fs.writeFileSync(path.join(bin, name), code, { mode: 0o755 });
  }
  const envFile = legacy ? path.join(project, 'deploy/.env') : path.join(data, 'hts.env');
  if (existing) {
    fs.mkdirSync(data);
    const template = fs.readFileSync(path.join(root, 'deploy/.env.example'), 'utf8');
    fs.writeFileSync(envFile, template.replace('/srv/hts-data', data).replace('HTS_DOMAIN=', 'HTS_DOMAIN=hts.example.vn').replace('PUBLIC_ORIGIN=', 'PUBLIC_ORIGIN=https://hts.example.vn').replace('HTS_BACKEND_IMAGE=', 'HTS_BACKEND_IMAGE=e2e/hts-backend:1.0.0').replace('HTS_WEB_IMAGE=', 'HTS_WEB_IMAGE=e2e/hts-web:1.0.0').replace('GENERATE_APP_DB_PASSWORD', 'a'.repeat(64)).replace('GENERATE_ROOT_DB_PASSWORD', 'b'.repeat(64)).replace('GENERATE_JWT_SECRET', 'c'.repeat(64)).replace('GENERATE_CSRF_SECRET', 'd'.repeat(64)));
  }
  const callsFile = path.join(folder, 'calls.jsonl'), credentials = path.join(folder, 'credentials'), imported = path.join(folder, 'imported.sql');
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, HTS_DATA_DIR: data, HTS_ENV_FILE: envFile, MOCK_CALLS: callsFile, MOCK_CREDENTIALS: credentials, MOCK_IMPORT: imported, MOCK_ACCESS: path.join(folder, 'access.json') };
  if (!existing) { env.HTS_BACKEND_IMAGE='e2e/hts-backend:1.0.0'; env.HTS_WEB_IMAGE='e2e/hts-web:1.0.0'; }
  if (legacy) delete env.HTS_ENV_FILE;
  const run = (args = [], input = '', overrides = {}) => spawnSync('bash', [path.join(project, 'deploy.sh'), ...args], { cwd: folder, env: { ...env, ...overrides }, input, encoding: 'utf8', timeout: 15000 });
  const calls = () => fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  return { folder, project, data, envFile, credentials, imported, calls, run, access: () => JSON.parse(fs.readFileSync(env.MOCK_ACCESS, 'utf8')) };
}
const joined = calls => calls.map(args => args.join(' '));
const assertPass = result => assert.equal(result.status, 0, result.stdout + result.stderr);

test('một lệnh cài mới: tạo secret riêng, migrate trước backend/admin và mở web cuối', t => {
  const f = fixture(t);
  const result = f.run([], `guide_admin\n${password}\n${password}\n`, { MOCK_DRAIN_STDIN: '1' });
  assertPass(result);
  const config = fs.readFileSync(f.envFile, 'utf8');
  const secrets = [...config.matchAll(/^(?:MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD|JWT_SECRET|CSRF_SECRET)=([a-f0-9]{64})$/gm)].map(match => match[1]);
  assert.equal(secrets.length, 4); assert.equal(new Set(secrets).size, 4); assert.equal(fs.statSync(f.envFile).mode & 0o777, 0o600);
  assert.match(config, /^PUBLIC_ORIGIN=$/m);
  assert.deepEqual(f.access(), { site: ':80', cookie: 'hts_session', secure: 'false', sameOrigin: 'true' });
  assert.ok(joined(f.calls()).some(call => call.includes('pull backend web db')));
  assert.equal(joined(f.calls()).some(call => call.includes('compose') && call.includes('build')), false);
  const calls = joined(f.calls());
  const migration = calls.findIndex(call => call.includes('run --rm --no-deps migrate'));
  const backend = calls.findIndex(call => call.includes('up -d --wait --no-deps backend'));
  const admin = calls.findIndex(call => call.includes('scripts/bootstrap-admin.js'));
  const web = calls.findIndex(call => call.includes('up -d --wait --no-deps web'));
  assert.ok(migration >= 0 && migration < backend && backend < admin && admin < web);
  assert.equal(calls.some(call => call.includes('mysqldump')), false);
  assert.equal(fs.readFileSync(f.credentials, 'utf8'), `guide_admin\n${password}\n`);
  assert.ok(!JSON.stringify(calls).includes(password) && !result.stdout.includes(password) && !result.stderr.includes(password));
  assert.ok(fs.existsSync(path.join(f.data, 'mysql')));
});
test('cập nhật giữ nguyên cấu hình cũ, backup trước khi dừng ứng dụng và không tạo lại admin', t => {
  const f = fixture(t, { existing: true, legacy: true });
  const before = fs.readFileSync(f.envFile, 'utf8');
  assertPass(f.run([], '', { MOCK_TABLES: '7', MOCK_ADMIN_NEEDED: 'no' }));
  assert.equal(fs.readFileSync(f.envFile, 'utf8'), before);
  const calls = joined(f.calls());
  assert.ok(calls.findIndex(call => call.includes('mysqldump')) < calls.findIndex(call => call.includes('stop web backend')));
  assert.equal(calls.some(call => call.includes('scripts/bootstrap-admin.js')), false);
  assert.equal(calls.some(call => call.includes('DROP DATABASE')), false);
  const files = fs.readdirSync(path.join(f.data, 'backups'));
  assert.equal(files.length, 3); assert.ok(files.some(name => name.endsWith('.env')));
});
test('backup tạo SQL nén, checksum và bản sao cấu hình ngoài source', t => {
  const f = fixture(t, { existing: true });
  const result = f.run(['backup']); assertPass(result);
  const archive = result.stdout.trim();
  assert.ok(archive.startsWith(path.join(f.data, 'backups') + path.sep));
  assert.equal(gunzipSync(fs.readFileSync(archive)).toString(), sql);
  assert.equal(fs.readFileSync(archive + '.sha256', 'utf8').split(' ')[0], createHash('sha256').update(fs.readFileSync(archive)).digest('hex'));
  assert.equal(fs.readFileSync(archive.replace(/\.sql\.gz$/, '.env'), 'utf8'), fs.readFileSync(f.envFile, 'utf8'));
});
test('pull image thất bại giữ ứng dụng đang chạy và không chạy migration', t => {
  const f = fixture(t, { existing: true });
  assert.notEqual(f.run([], '', { MOCK_PULL_FAIL: '1' }).status, 0);
  assert.equal(joined(f.calls()).some(call => call.includes('stop ') || call.includes('run --rm')), false);
});
test('backup thất bại dừng cập nhật trước khi tắt ứng dụng, không để lại SQL hoàn chỉnh', t => {
  const f = fixture(t, { existing: true });
  assert.notEqual(f.run([], '', { MOCK_TABLES: '5', MOCK_BACKUP_FAIL: '1' }).status, 0);
  assert.equal(joined(f.calls()).some(call => call.includes('stop ') || call.includes('run --rm')), false);
  assert.equal(fs.readdirSync(path.join(f.data, 'backups')).some(file => file.endsWith('.sql.gz')), false);
});
test('migration hoặc tạo admin thất bại không mở web', t => {
  for (const overrides of [{ MOCK_MIGRATION_FAIL: '1' }, { MOCK_BOOTSTRAP_FAIL: '1' }]) {
    const f = fixture(t, { existing: true });
    assert.notEqual(f.run([], `guide_admin\n${password}\n${password}\n`, overrides).status, 0);
    assert.equal(joined(f.calls()).some(call => call.includes('up -d --wait --no-deps web')), false);
  }
});
test('restore kiểm tra file và checksum trước khi đụng tới database', t => {
  const f = fixture(t, { existing: true });
  const file = path.join(f.folder, 'backup.sql.gz'); fs.writeFileSync(file, gzipSync(sql));
  fs.writeFileSync(file + '.sha256', '0'.repeat(64) + '  backup.sql.gz\n');
  const result = f.run(['restore', file], 'KHOI PHUC\n');
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Checksum/);
  assert.equal(joined(f.calls()).some(call => call.includes('stop ') || call.includes('DROP DATABASE') || call.includes('mysqldump')), false);
});
test('hủy xác nhận restore không thay đổi dữ liệu', t => {
  const f = fixture(t, { existing: true });
  const file = path.join(f.folder, 'backup.sql.gz'); fs.writeFileSync(file, gzipSync(sql));
  assert.notEqual(f.run(['restore', file], 'HUY\n').status, 0);
  assert.equal(joined(f.calls()).some(call => call.includes('stop ') || call.includes('DROP DATABASE')), false);
});
test('restore hợp lệ backup trước thay DB, import đúng SQL rồi migrate và mở lại ứng dụng', t => {
  const f = fixture(t, { existing: true });
  const file = path.join(f.folder, 'backup.sql.gz'); fs.writeFileSync(file, gzipSync(sql));
  assertPass(f.run(['restore', file], 'KHOI PHUC\n'));
  assert.equal(fs.readFileSync(f.imported, 'utf8'), sql);
  const calls = joined(f.calls());
  const backup = calls.findIndex(call => call.includes('mysqldump')), drop = calls.findIndex(call => call.includes('DROP DATABASE'));
  assert.ok(backup >= 0 && drop > backup);
  assert.ok(calls.findIndex(call => call.includes('run --rm --no-deps migrate')) > drop);
  assert.ok(calls.at(-1).includes('up -d --wait --no-deps web'));
});
test('không source file env thành lệnh shell, không tạo dữ liệu trong source', t => {
  const f = fixture(t, { existing: true });
  const marker = path.join(f.folder, 'must-not-exist');
  fs.appendFileSync(f.envFile, `\nEXTRA=$(touch ${marker})\n`);
  assertPass(f.run(['status'])); assert.equal(fs.existsSync(marker), false);
  assert.notEqual(f.run(['status'], '', { HTS_DATA_DIR: f.project }).status, 0);
  const link = path.join(f.folder, 'source-link'); fs.symlinkSync(f.project, link);
  assert.notEqual(f.run(['status'], '', { HTS_DATA_DIR: link }).status, 0);
  assert.equal(fs.existsSync(path.join(f.project, 'mysql')), false);
});
test('Docker chưa sẵn sàng không tạo config dở dang', t => {
  const f = fixture(t);
  assert.notEqual(f.run([], '', { MOCK_DOCKER_FAIL: '1' }).status, 0);
  assert.equal(fs.existsSync(f.envFile), false);
});
test('toàn bộ Bash đúng cú pháp và các file vận hành cũ đã được gỡ', () => {
  assert.equal(spawnSync('bash', ['-n', path.join(root, 'deploy.sh')]).status, 0);
  for (const file of ['init.sh','common.sh','hts.sh','backup.sh','restore.sh','bootstrap-admin.sh','smoke-test.py']) assert.equal(fs.existsSync(path.join(root, 'deploy', file)), false);
});

test('publish build hai image đúng tên, tag, platform và không vận hành database', t => {
  const f = fixture(t);
  assertPass(f.run(['publish', 'e2euser', '1.2.3']));
  const builds = f.calls().filter(args => args[0] === 'buildx' && args[1] === 'build');
  assert.equal(builds.length, 2);
  for (const args of builds) { assert.ok(args.includes('--push')); assert.ok(args.includes('linux/amd64')); }
  assert.ok(builds[0].includes('e2euser/hts-backend:1.2.3'));
  assert.ok(builds[1].includes('e2euser/hts-web:1.2.3'));
  assert.equal(f.calls().some(args => args[0] === 'compose'), false);
  assert.equal(fs.existsSync(f.envFile), false);
});
test('deploy phiên bản mới chỉ pull image, giữ khóa/dữ liệu và không tạo lại admin', t => {
  const f = fixture(t, { existing: true });
  const before = fs.readFileSync(f.envFile, 'utf8');
  assertPass(f.run(['deploy', 'e2euser', '1.2.3'], '', { MOCK_TABLES: '7', MOCK_ADMIN_NEEDED: 'no' }));
  const after = fs.readFileSync(f.envFile, 'utf8');
  assert.match(after, /HTS_BACKEND_IMAGE=e2euser\/hts-backend:1.2.3/);
  assert.match(after, /HTS_WEB_IMAGE=e2euser\/hts-web:1.2.3/);
  for (const line of before.split('\n').filter(line => /^(MYSQL_|JWT_|CSRF_)/.test(line))) assert.ok(after.includes(line));
  const calls = joined(f.calls());
  assert.equal(calls.some(call => call.includes('scripts/bootstrap-admin.js') || call.includes('DROP DATABASE') || call.includes('buildx')), false);
  assert.ok(calls.findIndex(call => call.includes('pull backend web db')) < calls.findIndex(call => call.includes('stop web backend')));
});
test('chế độ HTTP tự do đổi sang HTTPS bằng origin mà không đổi khóa', t => {
  const f = fixture(t, { existing: true });
  let config = fs.readFileSync(f.envFile, 'utf8').replace('HTS_DOMAIN=hts.example.vn', 'HTS_DOMAIN=').replace('PUBLIC_ORIGIN=https://hts.example.vn', 'PUBLIC_ORIGIN=');
  fs.writeFileSync(f.envFile, config);
  assertPass(f.run(['status']));
  assert.deepEqual(f.access(), { site: ':80', cookie: 'hts_session', secure: 'false', sameOrigin: 'true' });
  config = config.replace('PUBLIC_ORIGIN=', 'PUBLIC_ORIGIN=https://hts.example.vn');
  fs.writeFileSync(f.envFile, config);
  assertPass(f.run(['status']));
  assert.deepEqual(f.access(), { site: 'https://hts.example.vn', cookie: '__Host-hts_session', secure: 'true', sameOrigin: 'false' });
  assert.equal(fs.readFileSync(f.envFile, 'utf8'), config);
});
test('từ chối image/tag sai và origin không khớp host trước khi vận hành', t => {
  const f = fixture(t, { existing: true });
  for (const args of [['publish','bad/name','1.0.0'], ['deploy','e2euser','bad tag'], ['publish','e2euser']]) {
    assert.notEqual(f.run(args).status, 0);
  }
  fs.appendFileSync(f.envFile, '\nPUBLIC_ORIGIN=http://203.0.113.10\n');
  assert.notEqual(f.run(['status']).status, 0);
});
test('cookie production cho HTTP và HTTPS giữ HttpOnly, SameSite và đúng Secure', () => {
  for (const secure of [false, true]) {
    const name = secure ? '__Host-hts_session' : 'hts_session';
    const result = spawnSync(process.execPath, ['-e', `const cookie=require('./backend/src/utils/auth-cookie');cookie.setAuthCookie({cookie:(name,value,options)=>console.log(JSON.stringify({name,...options}))},'E2E_token',Date.now()+60000);`], { cwd: root, env: { ...process.env, NODE_ENV: 'production', AUTH_COOKIE_NAME: name, AUTH_COOKIE_SECURE: String(secure), AUTH_COOKIE_SAME_SITE: 'lax' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const cookie = JSON.parse(result.stdout);
    assert.equal(cookie.name, name); assert.equal(cookie.secure, secure);
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, 'lax'); assert.equal(cookie.path, '/');
  }
});
