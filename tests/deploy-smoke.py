#!/usr/bin/env python3
"""Optional developer test, not needed on the VPS: isolated Docker deployment/backup/restore."""
import gzip
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
TEMP = Path(tempfile.mkdtemp(prefix='hts-docker-smoke-'))
PROJECT = 'hts-smoke-' + secrets.token_hex(4)
ENV = dict(os.environ, HTS_ENV_FILE=str(TEMP / 'env'))
TAG = PROJECT
password = secrets.token_hex(16)
success = False


def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


HTTP_PORT, HTTPS_PORT = port(), port()
while HTTP_PORT == HTTPS_PORT:
    HTTPS_PORT = port()
ORIGIN = f'http://127.0.0.1:{HTTP_PORT}'


def run(args, check=True, input=None):
    result = subprocess.run(args, cwd=ROOT, env=ENV, text=True, capture_output=True, input=input)
    with (TEMP / 'docker.log').open('a') as log:
        log.write('$ ' + ' '.join(map(str, args)) + '\n' + ('<configuration redacted>\n' if 'config' in args and 'json' in args else result.stdout) + result.stderr + '\n')
    if check and result.returncode:
        raise RuntimeError(f'Lệnh thất bại: {args}; xem {TEMP / "docker.log"}')
    return result


def compose(*args, check=True, input=None):
    return run(['docker', 'compose', '--project-directory', str(ROOT), '--env-file', ENV['HTS_ENV_FILE'], '-f', str(ROOT / 'compose.yaml'), *args], check=check, input=input)


jar = http.cookiejar.CookieJar()
# Test mặc định HTTP không khai báo IP/tên miền; cookie và CSRF vẫn hoạt động.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(jar))
csrf = None


def api(path, body=None, method='GET'):
    headers = {'Origin': ORIGIN}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if csrf:
        headers['X-CSRF-Token'] = csrf
    req = urllib.request.Request(ORIGIN + '/api' + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers)
    with opener.open(req, timeout=30) as response:
        return json.load(response), response.headers


try:
    template = (ROOT / 'deploy/.env.example').read_text()
    values = {'COMPOSE_PROJECT_NAME': PROJECT, 'HTS_IMAGE_TAG': TAG, 'HTS_BACKEND_IMAGE': f'hts-backend:{TAG}', 'HTS_WEB_IMAGE': f'hts-web:{TAG}', 'HTS_DOMAIN': '', 'PUBLIC_ORIGIN': '', 'HTS_SITE_ADDRESS': ':80', 'CORS_ALLOW_SAME_ORIGIN': 'true', 'AUTH_COOKIE_NAME': 'hts_session', 'AUTH_COOKIE_SECURE': 'false', 'ACME_EMAIL': 'admin@example.com', 'HTTP_PORT': f'127.0.0.1:{HTTP_PORT}', 'HTTPS_PORT': f'127.0.0.1:{HTTPS_PORT}', 'HTS_DATA_DIR': str(TEMP / 'data'), 'MYSQL_PASSWORD': secrets.token_hex(32), 'MYSQL_ROOT_PASSWORD': secrets.token_hex(32), 'JWT_SECRET': secrets.token_hex(32), 'CSRF_SECRET': secrets.token_hex(32)}
    ENV.update(values)
    ENV['HTS_SKIP_PULL'] = '1'  # Chỉ test local: dùng đúng các image tạm vừa build, không cần Docker Hub.
    ENV.pop('HTS_IMAGE_NAMESPACE', None)
    ENV.update(VAPID_PUBLIC_KEY='', VAPID_PRIVATE_KEY='', VAPID_SUBJECT='')
    lines = []
    for line in template.splitlines():
        key = line.split('=', 1)[0]
        lines.append(f'{key}={values[key]}' if key in values else line)
    (TEMP / 'env').write_text('\n'.join(lines) + '\n')
    (TEMP / 'env').chmod(0o600)
    for folder in ['mysql', 'logs', 'caddy/data', 'caddy/config', 'backups']:
        (TEMP / 'data' / folder).mkdir(parents=True, exist_ok=True)
    if os.geteuid() == 0:
        os.chown(TEMP / 'data/logs', 1000, 1000)
    else:
        (TEMP / 'data/logs').chmod(0o777)  # Temporary Docker Desktop test only; deploy.sh uses UID 1000 on the VPS.
    run(['docker', 'build', '-f', 'backend/Dockerfile', '-t', f'hts-backend:{TAG}', '.'])
    run(['docker', 'build', '-f', 'frontend/Dockerfile', '-t', f'hts-web:{TAG}', '.'])
    compose('config', '--quiet')
    run(['bash', str(ROOT / 'deploy.sh')], input=f'E2E_DOCKER_admin\n{password}\n{password}\n')
    config = json.loads(compose('config', '--format', 'json').stdout)
    assert not config['services']['db'].get('ports')
    assert not config['services']['backend'].get('ports')
    compose('exec', '-T', 'backend', 'node', '-e', "if(process.getuid()!==1000 || require('fs').existsSync('/app/.env'))process.exit(1)")
    assert api('/health')[0]['status'] == 'ok'
    assert opener.open(ORIGIN + '/work', timeout=30).status == 200
    missing = None
    try:
        opener.open(ORIGIN + '/assets/does-not-exist.js', timeout=30)
    except urllib.error.HTTPError as error:
        missing = error.code
    assert missing == 404, 'Asset không có không được trả HTML SPA'
    disabled = None
    try:
        api('/auth/bootstrap-admin', {'username': 'E2E_DOCKER_public', 'password': password}, 'POST')
    except urllib.error.HTTPError as error:
        disabled = error.code
    assert disabled == 403, 'Bootstrap public phải tắt khi không cấu hình BOOTSTRAP_TOKEN'
    auth, headers = api('/auth/login', {'username': 'E2E_DOCKER_admin', 'password': password}, 'POST')
    cookie = headers.get('Set-Cookie', '')
    assert 'hts_session=' in cookie and 'Secure' not in cookie and 'HttpOnly' in cookie
    csrf = auth['csrfToken']
    assert api('/auth/me')[0]['user']['username'] == 'E2E_DOCKER_admin'
    # Trang khác không được đọc API; cookie thiếu CSRF không được ghi.
    try:
        opener.open(urllib.request.Request(ORIGIN + '/api/auth/me', headers={'Origin': 'https://evil.example'}), timeout=30)
        raise AssertionError('CORS phải chặn website khác')
    except urllib.error.HTTPError as error:
        assert error.code == 403
    saved_csrf, csrf = csrf, None
    try:
        api('/departments', {'code': 'E2E_MISSING_CSRF', 'name': 'E2E Thiếu CSRF'}, 'POST')
        raise AssertionError('Thiếu CSRF phải bị chặn')
    except urllib.error.HTTPError as error:
        assert error.code == 403
    finally:
        csrf = saved_csrf
    api('/departments', {'code': 'E2E_DOCKER_BEFORE', 'name': 'E2E Docker trước backup'}, 'POST')
    backup = Path(run(['bash', str(ROOT / 'deploy.sh'), 'backup']).stdout.strip())
    assert backup.is_file() and Path(str(backup) + '.sha256').is_file()
    assert backup.with_name(backup.name.removesuffix('.sql.gz') + '.env').is_file()
    with gzip.open(backup, 'rt') as sql:
        assert 'E2E_DOCKER_BEFORE' in sql.read()
    api('/departments', {'code': 'E2E_DOCKER_AFTER', 'name': 'E2E Docker sau backup'}, 'POST')
    corrupt = backup.parent / 'corrupt.sql.gz'
    shutil.copyfile(backup, corrupt)
    Path(str(corrupt) + '.sha256').write_text('0' * 64 + '  corrupt.sql.gz\n')
    rejected = run(['bash', str(ROOT / 'deploy.sh'), 'restore', str(corrupt)], check=False)
    assert rejected.returncode != 0 and 'Checksum' in rejected.stderr
    assert api('/health')[0]['status'] == 'ok', 'Checksum sai phải dừng trước khi tắt app'
    run(['bash', str(ROOT / 'deploy.sh'), 'restore', str(backup)], input='KHOI PHUC\n')
    jar.clear()
    auth, _ = api('/auth/login', {'username': 'E2E_DOCKER_admin', 'password': password}, 'POST')
    csrf = auth['csrfToken']
    codes = [item['code'] for item in api('/departments')[0]]
    assert 'E2E_DOCKER_BEFORE' in codes and 'E2E_DOCKER_AFTER' not in codes
    compose('up', '-d', '--force-recreate', '--wait', '--wait-timeout', '180', 'db', 'backend', 'web')
    codes = [item['code'] for item in api('/departments')[0]]
    assert 'E2E_DOCKER_BEFORE' in codes, 'Bind mount phải giữ dữ liệu khi recreate container'
    assert list((TEMP / 'data/logs').glob('*.log'))
    assert (TEMP / 'data/caddy/data').is_dir()
    success = True
    print('PASS: image local, HTTP không khai báo địa chỉ, cookie/CSRF/CORS, SPA/API, backup/checksum, restore và dữ liệu sau recreate.')
finally:
    compose('down', '--remove-orphans', check=False)
    if success and os.environ.get('HTS_SMOKE_KEEP') != '1':
        shutil.rmtree(TEMP, ignore_errors=True)
        run_images = ['docker', 'image', 'rm', f'hts-backend:{TAG}', f'hts-web:{TAG}']
        subprocess.run(run_images, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        print(f'Artifact thử nghiệm giữ tại {TEMP}; stack {PROJECT} đã được dừng.')
