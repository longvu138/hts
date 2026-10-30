const test = require('node:test');
const assert = require('node:assert/strict');
const { isOriginAllowed } = require('./cors-origin');
const req = (protocol = 'http', host = '203.0.113.10:8080') => ({ protocol, get: key => key === 'host' ? host : undefined });

test('HTTP không cấu hình IP chỉ cho cùng website gọi API, không cho website khác', () => {
  assert.equal(isOriginAllowed(req(), 'http://203.0.113.10:8080', [], true), true);
  for (const origin of ['https://evil.example', 'http://203.0.113.10:8081', 'https://203.0.113.10:8080', 'null', 'http://203.0.113.10:8080/path']) {
    assert.equal(isOriginAllowed(req(), origin, [], true), false, origin);
  }
  assert.equal(isOriginAllowed(req(), 'http://203.0.113.10:8080'), false);
});
test('HTTPS qua proxy và allowlist cũ vẫn được giữ; host sai không mở quyền', () => {
  assert.equal(isOriginAllowed(req('https', 'hts.example.vn'), 'https://hts.example.vn', [], true), true);
  assert.equal(isOriginAllowed(req(), 'https://allowed.example', ['https://allowed.example']), true);
  assert.equal(isOriginAllowed(req(), undefined), true);
  assert.equal(isOriginAllowed(req('http', 'bad host'), 'https://evil.example', [], true), false);
});
