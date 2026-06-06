import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// 從 repo 根載入共享 .env（與 apps/api 同一份）。維持物件式匯出，
// 以免 vitest.config.ts 的 mergeConfig 無法合併函式。
//
// 安全：第三參數限定白名單前綴，讓 JWT_SECRET、COOKIE_SECRET、DATABASE_URL
// 等機敏值「物理上」進不了這個 config，避免日後誤用 define 注入而外洩。
// 僅放行 VITE_（前端 bundle 可見）與 dev server 需要的兩個非機敏值。
const env = loadEnv(
  process.env.NODE_ENV ?? "development",
  path.resolve(__dirname, "../.."),
  ["VITE_", "WEB_PORT", "API_TARGET"],
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: Number(env.WEB_PORT ?? 3087),
    proxy: {
      "/api": {
        target: env.API_TARGET ?? "http://localhost:8090",
        changeOrigin: true,
      },
    },
  },
});
