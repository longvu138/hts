const pad2 = (value) => String(value).padStart(2, "0");

const buildRunStamp = () => {
  const date = new Date();
  return [
    String(date.getFullYear()).slice(-2),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    "_",
    pad2(date.getHours()),
    pad2(date.getMinutes()),
  ].join("");
};

export const e2eRunStamp = process.env.E2E_RUN_ID || buildRunStamp();

let sequence = 0;

const E2E_LABELS = {
  DEPT: "Phòng Kiểm thử nghiệp vụ",
  DEPT_PARENT: "Phòng Chuyển đổi số",
  DEPT_CHILD: "Tổ Dữ liệu và nền tảng số",
  USER_AUTH: "Nguyễn Văn Kiểm Thử",
  USER_FULLNAME: "Trần Minh Thử Nghiệm",
};

export const e2eSuffix = () => {
  const seq = (sequence++).toString(36).padStart(2, "0");
  const random = Math.random().toString(36).slice(2, 4);
  return `${e2eRunStamp}_${seq}${random}`;
};

const readableLabel = (kind) =>
  E2E_LABELS[kind] || `Dữ liệu kiểm thử ${String(kind).replaceAll("_", " ").toLocaleLowerCase("vi-VN")}`;

export const e2eName = (kind) =>
  `E2E_${kind}_${e2eSuffix()} — ${readableLabel(kind)}`;

export const flattenTree = (nodes = []) =>
  nodes.flatMap((node) => [node, ...flattenTree(node.children || [])]);
