import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const getNodeModulePackageName = (id) => {
  const normalized = id.split(path.sep).join("/");
  const packagePath = normalized.split("/node_modules/").pop() || "";
  const scopedParts = packagePath.split("/");

  if (packagePath.startsWith("@")) {
    return scopedParts.slice(0, 2).join("/");
  }

  return scopedParts[0];
};

const REACT_VENDOR_PACKAGES = new Set([
  "react",
  "react-dom",
  "scheduler",
  "react-router",
  "react-router-dom",
  "@tanstack/react-query",
  "@tanstack/query-core",
]);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3109,
    strictPort: true,
    hmr: {
      protocol: "ws",
      host: "localhost",
      clientPort: 3109,
    },
  },
  preview: { port: 4174, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Chỉ tách nhóm vendor ổn định, dùng ở mọi trang (React/Router/React Query) để cache lâu dài.
        // Ant Design và icon KHÔNG gom vào một chunk: để bundler đặt từng component cạnh trang lazy
        // dùng nó, nhờ vậy trang đăng nhập không phải tải toàn bộ ~1.3 MB antd.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const packageName = getNodeModulePackageName(id);
          if (REACT_VENDOR_PACKAGES.has(packageName)) return "react-vendor";
          return undefined;
        },
      },
    },
  },
});
