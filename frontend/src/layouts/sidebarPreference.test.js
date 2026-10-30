import assert from "node:assert/strict";
import test from "node:test";
import { resolveInitialSidebarCollapsed } from "./sidebarPreference.js";

test("chưa lưu lựa chọn: mở rộng ở màn rộng, thu gọn ở màn hẹp", () => {
  assert.equal(resolveInitialSidebarCollapsed(null, true), false);
  assert.equal(resolveInitialSidebarCollapsed(null, false), true);
});

test("lựa chọn đã lưu được ưu tiên hơn độ rộng màn hình", () => {
  assert.equal(resolveInitialSidebarCollapsed("true", true), true);
  assert.equal(resolveInitialSidebarCollapsed("false", false), false);
});

test("giá trị lưu hỏng được bỏ qua", () => {
  assert.equal(resolveInitialSidebarCollapsed("abc", true), false);
  assert.equal(resolveInitialSidebarCollapsed(undefined, false), true);
});
