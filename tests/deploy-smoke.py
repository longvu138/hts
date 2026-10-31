#!/usr/bin/env python3
"""Optional developer test, not needed on the VPS: isolated Docker deployment/backup/restore."""
import hashlib
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
ENV = dict(os.environ, HTS_ENV_FILE=str(TEMP / '.env'))
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


def api(path, body=None, method='GET', extra_headers=None):
    headers = {'Origin': ORIGIN}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    if csrf:
        headers['X-CSRF-Token'] = csrf
    headers.update(extra_headers or {})
    req = urllib.request.Request(ORIGIN + '/api' + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers)
    with opener.open(req, timeout=30) as response:
        return json.load(response), response.headers


try:
    values = {'COMPOSE_PROJECT_NAME': PROJECT, 'HTS_IMAGE_TAG': TAG, 'HTS_BACKEND_IMAGE': f'hts-backend:{TAG}', 'HTS_WEB_IMAGE': f'hts-web:{TAG}', 'PUBLIC_ORIGIN': '', 'HTS_SITE_ADDRESS': ':80', 'CORS_ALLOW_SAME_ORIGIN': 'true', 'AUTH_COOKIE_NAME': 'hts_session', 'AUTH_COOKIE_SECURE': 'false', 'HTTP_PORT': f'127.0.0.1:{HTTP_PORT}', 'HTTPS_PORT': f'127.0.0.1:{HTTPS_PORT}', 'HTS_DATA_DIR': str(TEMP / 'data')}
    ENV.update(values)
    ENV.pop('HTS_IMAGE_NAMESPACE', None)
    ENV.update(VAPID_PUBLIC_KEY='', VAPID_PRIVATE_KEY='', VAPID_SUBJECT='')
    for service, dockerfile in [('backend', 'backend/Dockerfile'), ('web', 'frontend/Dockerfile')]:
        run(['docker', 'build', '-f', dockerfile, '-t', f'hts-{service}:{TAG}', '.'])
    run(['docker', 'run', '--rm', '--user', '0', '-v', f'{TEMP}:/deploy', f'hts-backend:{TAG}', 'node', 'scripts/setup-deploy.js', 'e2e', TAG])
    # Keep fresh generated secrets; substitute only test image/path/ports/project.
    config = TEMP / '.env'
    lines = config.read_text().splitlines()
    config.write_text('\n'.join(f'{line.split("=", 1)[0]}={values[line.split("=", 1)[0]]}' if line.split('=', 1)[0] in values else line for line in lines) + '\n')
    compose('up', '-d', '--wait', '--wait-timeout', '240')
    token = next(line.split('=', 1)[1] for line in config.read_text().splitlines() if line.startswith('BOOTSTRAP_TOKEN='))
    admin_body = {'username': 'E2E_DOCKER_admin', 'password': password}
    for header in [{}, {'X-Bootstrap-Token': 'E2E_wrong_token'}]:
        try:
            api('/auth/bootstrap-admin', admin_body, 'POST', header)
            raise AssertionError('Bootstrap thiếu/sai token phải bị chặn')
        except urllib.error.HTTPError as error:
            assert error.code == 403
    try:
        api('/auth/bootstrap-admin', {'username': 123}, 'POST', {'X-Bootstrap-Token': token})
        raise AssertionError('Payload sai phải bị chặn')
    except urllib.error.HTTPError as error:
        assert error.code == 422
    created, _ = api('/auth/bootstrap-admin', admin_body, 'POST', {'X-Bootstrap-Token': token})
    assert created['user']['username'] == 'E2E_DOCKER_admin'
    try:
        api('/auth/bootstrap-admin', {'username': 'E2E_DOCKER_second', 'password': password}, 'POST', {'X-Bootstrap-Token': token})
        raise AssertionError('Không được tạo lại admin đầu tiên')
    except urllib.error.HTTPError as error:
        assert error.code == 409
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
    compose('run', '--rm', 'backup')
    backup = next((TEMP / 'data/backups').glob('*.sql'))
    assert backup.is_file() and Path(str(backup) + '.sha256').is_file()
    assert Path(str(backup) + '.env').is_file()
    assert 'E2E_DOCKER_BEFORE' in backup.read_text()
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()
    assert Path(str(backup) + '.sha256').read_text().split()[0] == digest
    api('/departments', {'code': 'E2E_DOCKER_AFTER', 'name': 'E2E Docker sau backup'}, 'POST')
    compose('stop', 'web', 'backend')
    compose('exec', '-T', 'db', 'sh', '-ec', 'export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -u root "$MYSQL_DATABASE"', input=backup.read_text())
    compose('run', '--rm', '--no-deps', 'migrate')
    compose('up', '-d', '--wait', '--no-deps', 'backend', 'web')
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
    print('PASS: Compose trực tiếp, setup secret, migration tự động, admin API (token/validation/chặn tạo lại), HTTP/cookie/CSRF/CORS, backup/checksum/restore và dữ liệu sau recreate.')
finally:
    compose('down', '--remove-orphans', check=False)
    if success and os.environ.get('HTS_SMOKE_KEEP') != '1':
        shutil.rmtree(TEMP, ignore_errors=True)
        run_images = ['docker', 'image', 'rm', f'hts-backend:{TAG}', f'hts-web:{TAG}']
        subprocess.run(run_images, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        print(f'Artifact thử nghiệm giữ tại {TEMP}; stack {PROJECT} đã được dừng.')
