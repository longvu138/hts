// Operator-only bootstrap: reads {"username","password",...} JSON from stdin and creates the
// first administrator directly through the service (no public HTTP endpoint needed).
// Usage (Docker): printf '%s' "$JSON" | docker compose exec -T backend node scripts/bootstrap-admin.js
require('dotenv').config({ quiet: true });
const db = require('../src/config/database');
const { bootstrapAdmin } = require('../src/modules/auth/auth-accounts.service');

const readStdin = () => new Promise((resolve, reject) => {
  let body = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { body += chunk; if (body.length > 10000) reject(new Error('Dữ liệu đầu vào quá lớn')); });
  process.stdin.on('end', () => resolve(body));
  process.stdin.on('error', reject);
});

(async () => {
  let input;
  try {
    input = JSON.parse(await readStdin());
  } catch {
    throw new Error('Dữ liệu đầu vào phải là JSON {"username","password"}');
  }
  const user = await bootstrapAdmin(input);
  console.log(`Đã tạo quản trị viên đầu tiên: ${user.username}`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.destroy());
