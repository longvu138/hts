const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workspaceRoot = path.resolve(__dirname, "../../..");
const roots = [
  path.join(workspaceRoot, "backend", "src"),
  path.join(workspaceRoot, "backend", "curl"),
  path.join(workspaceRoot, "frontend", "src"),
  path.join(workspaceRoot, "frontend", "e2e"),
];
const textExtensions = new Set([".js", ".jsx", ".json", ".md", ".css", ".curl"]);
const mojibakePattern = /\u00c3[\u0080-\u00bf]|\u00c4[\u0080-\u00bf]|\u00e1[\u00ba\u00bb]|\u00e2\u20ac|\ufffd/u;

const collectTextFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTextFiles(target);
    return textExtensions.has(path.extname(entry.name).toLowerCase()) ? [target] : [];
  });

test("source và tài liệu không chứa chuỗi tiếng Việt bị mojibake", () => {
  const invalidFiles = roots
    .flatMap(collectTextFiles)
    .filter((file) => mojibakePattern.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(workspaceRoot, file));

  assert.deepEqual(invalidFiles, []);
});
