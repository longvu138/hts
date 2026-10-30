import assert from "node:assert/strict";
import test from "node:test";
import { createSafeStorage } from "./safeStorage.js";

test("storage an toàn trả fallback khi trình duyệt chặn truy cập", () => {
  const storage = createSafeStorage(() => {
    throw new Error("blocked");
  });

  assert.equal(storage.getItem("theme", "light"), "light");
  assert.equal(storage.setItem("theme", "dark"), false);
  assert.equal(storage.removeItem("theme"), false);
});

test("JSON hỏng được xóa và không làm sập giao diện", () => {
  const values = new Map([["filters", "{invalid"]]);
  const storage = createSafeStorage(() => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }));

  assert.deepEqual(storage.getJSON("filters", []), []);
  assert.equal(values.has("filters"), false);
  assert.equal(storage.setJSON("filters", ["active"]), true);
  assert.deepEqual(storage.getJSON("filters", []), ["active"]);
});
