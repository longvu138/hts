const { mkdirSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const frontendDir = path.resolve(__dirname, "..");
const tempDir = path.join(frontendDir, ".playwright-tmp");
const cacheDir = path.join(frontendDir, ".playwright-cache");

mkdirSync(tempDir, { recursive: true });
mkdirSync(cacheDir, { recursive: true });

const playwrightCli = require.resolve("@playwright/test/cli");
const forwardedArgs = process.argv.slice(2);
if (forwardedArgs[0] === "--") forwardedArgs.shift();
// --quick works on every shell (PowerShell has no `VAR=1 cmd` syntax); see playwright.config.js.
const quickIndex = forwardedArgs.indexOf("--quick");
if (quickIndex !== -1) forwardedArgs.splice(quickIndex, 1);
const result = spawnSync(
  process.execPath,
  [playwrightCli, "test", ...forwardedArgs],
  {
    cwd: frontendDir,
    env: {
      ...process.env,
      ...(quickIndex !== -1 ? { E2E_QUICK: "1" } : {}),
      TMPDIR: tempDir,
      PWTEST_CACHE_DIR: cacheDir,
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
