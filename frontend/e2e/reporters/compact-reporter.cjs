// Minimal reporter for quick runs (E2E_QUICK=1): one line per failure plus a final count.
// Keeps output short enough to read in a terminal or paste into a review.
const firstLine = (text = "") => String(text).replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((line) => line.trim()).find(Boolean) || "";

class CompactReporter {
  constructor() {
    this.counts = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
    this.failures = [];
  }

  onTestEnd(test, result) {
    if (result.status === "skipped") return void (this.counts.skipped += 1);
    if (result.status === "passed") return void (this.counts[result.retry ? "flaky" : "passed"] += 1);
    if (result.retry < test.retries) return;
    this.counts.failed += 1;
    const error = result.errors?.[0] || {};
    const message = firstLine(error.message);
    const locator = (String(error.message || "").match(/(Locator: .+|waiting for .+)/) || [])[1] || "";
    const where = error.location ? `${error.location.file.split("/e2e/").pop()}:${error.location.line}` : "";
    const project = test.parent?.project()?.name || "";
    this.failures.push(`✘ [${project}] ${test.title}\n    ${message}${locator ? `\n    ${firstLine(locator)}` : ""}${where ? `\n    at ${where}` : ""}`);
  }

  onEnd() {
    if (this.failures.length) console.log(this.failures.join("\n"));
    const { passed, failed, skipped, flaky } = this.counts;
    console.log(`E2E: ${passed} passed, ${failed} failed, ${skipped} skipped${flaky ? `, ${flaky} flaky` : ""}`);
  }

  printsToStdio() {
    return true;
  }
}

module.exports = CompactReporter;
