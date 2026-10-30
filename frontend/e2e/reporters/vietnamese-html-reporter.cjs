const fs = require("node:fs/promises");
const path = require("node:path");

const STATUS_LABELS = {
  passed: "Đạt",
  failed: "Lỗi",
  timedOut: "Quá thời gian",
  skipped: "Bỏ qua",
  interrupted: "Bị dừng",
};

const STATUS_CLASS = {
  passed: "passed",
  failed: "failed",
  timedOut: "failed",
  skipped: "skipped",
  interrupted: "failed",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDuration = (ms = 0) => {
  if (!Number.isFinite(ms) || ms <= 0) return "0 giây";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} giây`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} phút ${rest} giây`;
};

const toRelativeLink = (fromDir, filePath) => {
  if (!filePath) return "";
  const relativePath = path.relative(fromDir, filePath);
  return relativePath.split(path.sep).join("/");
};

const summarize = (results) =>
  results.reduce(
    (summary, result) => {
      summary.total += 1;
      summary[result.status] = (summary[result.status] || 0) + 1;
      summary.duration += result.duration || 0;
      return summary;
    },
    { total: 0, passed: 0, failed: 0, timedOut: 0, skipped: 0, interrupted: 0, duration: 0 },
  );

const groupByProject = (results) => {
  const groups = new Map();
  for (const result of results) {
    const key = result.projectName || "Không rõ project";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(result);
  }
  return [...groups.entries()];
};

const renderAttachmentLinks = (attachments, outputDir) => {
  const usefulAttachments = attachments.filter((attachment) => attachment.path);
  if (!usefulAttachments.length) return "";

  return `
    <div class="attachments">
      ${usefulAttachments
        .map((attachment) => {
          const href = escapeHtml(toRelativeLink(outputDir, attachment.path));
          const name = escapeHtml(attachment.name || "Tệp đính kèm");
          return `<a href="${href}" target="_blank" rel="noreferrer">${name}</a>`;
        })
        .join("")}
    </div>
  `;
};

const renderError = (error) => {
  if (!error) return "";
  const message = error.message || error.value || String(error);
  return `<pre class="error">${escapeHtml(message)}</pre>`;
};

const getSkipReason = (annotations = []) => {
  const skipAnnotation = annotations.find((annotation) => annotation.type === "skip");
  return skipAnnotation?.description || "";
};

class VietnameseHtmlReporter {
  constructor(options = {}) {
    this.outputFolder = options.outputFolder || "playwright-report-vi";
    this.results = [];
    this.startedAt = new Date();
  }

  onTestEnd(test, result) {
    const titlePath = test.titlePath();
    const projectName = titlePath[1] || test.parent?.project()?.name || "";
    const fileName = titlePath[2] || "";
    const groupName = titlePath.length > 4 ? titlePath.slice(3, -1).join(" › ") : "";

    this.results.push({
      title: test.title,
      groupName,
      fileName,
      projectName,
      status: result.status,
      expectedStatus: test.expectedStatus,
      duration: result.duration,
      retry: result.retry,
      attachments: result.attachments || [],
      skipReason: getSkipReason(test.annotations || []),
      error: result.error,
    });
  }

  async onEnd() {
    const outputDir = path.resolve(process.cwd(), this.outputFolder);
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
    const html = this.render(outputDir);
    await fs.writeFile(path.join(outputDir, "index.html"), html, "utf8");
  }

  render(outputDir) {
    const summary = summarize(this.results);
    const finishedAt = new Date();
    const hasFailures = summary.failed + summary.timedOut + summary.interrupted > 0;

    return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Báo cáo kiểm thử Playwright</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #667085;
      --border: #e4e7ec;
      --passed: #0f9f6e;
      --failed: #d92d20;
      --skipped: #667085;
      --brand: #cf0011;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      background: var(--brand);
      color: #fff;
      padding: 24px clamp(16px, 4vw, 48px);
    }
    h1 { margin: 0 0 8px; font-size: clamp(24px, 4vw, 36px); }
    h2 { margin: 0 0 16px; font-size: 20px; }
    main { padding: 24px clamp(16px, 4vw, 48px) 48px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .card, section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(16, 24, 40, 0.06);
    }
    .card { padding: 16px; }
    .card strong { display: block; font-size: 28px; line-height: 1.2; }
    .card span { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 12px; }
    section { margin-bottom: 18px; overflow: hidden; }
    .section-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--border);
      align-items: center;
    }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 900px; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; background: #fcfcfd; }
    tr:last-child td { border-bottom: 0; }
    .status {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 10px;
      font-weight: 700;
      font-size: 12px;
      white-space: nowrap;
    }
    .status.passed { color: var(--passed); background: #e9f8f2; }
    .status.failed { color: var(--failed); background: #fef3f2; }
    .status.skipped { color: var(--skipped); background: #f2f4f7; }
    .muted { color: var(--muted); }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .attachments a {
      color: var(--brand);
      text-decoration: none;
      border: 1px solid #f3b5bc;
      border-radius: 6px;
      padding: 3px 8px;
      background: #fff5f6;
    }
    .error {
      max-width: 540px;
      white-space: pre-wrap;
      background: #fff5f6;
      color: #7a271a;
      border: 1px solid #fecdca;
      border-radius: 6px;
      padding: 10px;
      margin: 8px 0 0;
      font-size: 12px;
    }
    .skip-reason {
      margin-top: 6px;
      color: #475467;
      font-size: 13px;
    }
    .ok { color: var(--passed); }
    .bad { color: var(--failed); }
  </style>
</head>
<body>
  <header>
    <h1>Báo cáo kiểm thử Playwright</h1>
    <div>${escapeHtml(this.startedAt.toLocaleString("vi-VN"))} - ${escapeHtml(finishedAt.toLocaleString("vi-VN"))}</div>
  </header>
  <main>
    <div class="summary">
      <div class="card"><span>Tổng số case</span><strong>${summary.total}</strong></div>
      <div class="card"><span>Đạt</span><strong class="ok">${summary.passed}</strong></div>
      <div class="card"><span>Lỗi</span><strong class="${hasFailures ? "bad" : "ok"}">${summary.failed + summary.timedOut + summary.interrupted}</strong></div>
      <div class="card"><span>Bỏ qua</span><strong>${summary.skipped}</strong></div>
      <div class="card"><span>Thời gian chạy</span><strong>${escapeHtml(formatDuration(summary.duration))}</strong></div>
    </div>

    ${groupByProject(this.results)
      .map(([projectName, results]) => {
        const projectSummary = summarize(results);
        return `
          <section>
            <div class="section-head">
              <h2>${escapeHtml(projectName)}</h2>
              <div class="muted">
                ${projectSummary.total} case · ${projectSummary.passed} đạt · ${projectSummary.failed + projectSummary.timedOut + projectSummary.interrupted} lỗi · ${projectSummary.skipped} bỏ qua
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th>Nhóm chức năng</th>
                    <th>Tên test case</th>
                    <th>File</th>
                    <th>Thời gian</th>
                    <th>Tệp liên quan</th>
                  </tr>
                </thead>
                <tbody>
                  ${results
                    .map((result) => `
                      <tr>
                        <td><span class="status ${STATUS_CLASS[result.status] || "skipped"}">${STATUS_LABELS[result.status] || result.status}</span></td>
                        <td>${escapeHtml(result.groupName || "Không có nhóm")}</td>
                        <td>
                          <strong>${escapeHtml(result.title)}</strong>
                          ${result.retry ? `<div class="muted">Chạy lại lần ${result.retry}</div>` : ""}
                          ${
                            result.status === "skipped" && result.skipReason
                              ? `<div class="skip-reason"><strong>Lý do bỏ qua:</strong> ${escapeHtml(result.skipReason)}</div>`
                              : ""
                          }
                          ${renderError(result.error)}
                        </td>
                        <td class="muted">${escapeHtml(result.fileName)}</td>
                        <td>${escapeHtml(formatDuration(result.duration))}</td>
                        <td>${renderAttachmentLinks(result.attachments, outputDir)}</td>
                      </tr>
                    `)
                    .join("")}
                </tbody>
              </table>
            </div>
          </section>
        `;
      })
      .join("")}
  </main>
</body>
</html>`;
  }
}

module.exports = VietnameseHtmlReporter;
