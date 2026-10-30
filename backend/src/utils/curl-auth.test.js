const assert = require("node:assert/strict");
const { readdir, readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

const CURL_DIRECTORY = path.resolve(__dirname, "../../curl");

test("cURL xác thực dùng cookie HttpOnly thay cho Authorization Bearer", async () => {
  const files = (await readdir(CURL_DIRECTORY)).filter((file) => file.endsWith(".curl"));
  const invalidFiles = [];
  for (const file of files) {
    const source = await readFile(path.join(CURL_DIRECTORY, file), "utf8");
    if (/Authorization:\s*Bearer|ACCESS_TOKEN|access_token/.test(source)) {
      invalidFiles.push(file);
    }
  }
  assert.deepEqual(invalidFiles, []);
});

test("cURL thay đổi dữ liệu bằng cookie đều gửi CSRF token", async () => {
  const files = (await readdir(CURL_DIRECTORY)).filter(
    (file) => file.endsWith(".curl") && !["auth.curl", "health.curl"].includes(file),
  );
  const invalidScenarios = [];
  for (const file of files) {
    const source = await readFile(path.join(CURL_DIRECTORY, file), "utf8");
    const scenarios = source.split(/\r?\n\r?\n/);
    scenarios.forEach((scenario, index) => {
      const usesCookie = /--cookie\s+\S+\.cookies\.txt/.test(scenario);
      // `curl --get --data` sends the data as a query string, so it is a read, not a write.
      const isQueryOnly = /(^|\s)(--get|-G)(\s|$)/.test(scenario) && !/--request\s+(POST|PUT|PATCH|DELETE)/.test(scenario);
      const changesData = !isQueryOnly && /--data\b|--request\s+(POST|PUT|PATCH|DELETE)/.test(scenario);
      if (usesCookie && changesData && !/X-CSRF-Token/.test(scenario)) {
        invalidScenarios.push(`${file}#${index + 1}`);
      }
    });
  }
  assert.deepEqual(invalidScenarios, []);
});
