import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function backendProxyTarget() {
  const envPath = resolve(__dirname, "../backend/.env");
  try {
    const env = readFileSync(envPath, "utf-8");
    const match = env.match(/^PORT="?(\d+)"?$/m);
    const port = match?.[1] ?? "3333";
    return `http://localhost:${port}`;
  } catch {
    return "http://localhost:3333";
  }
}

const proxyTarget = backendProxyTarget();

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/api": proxyTarget,
      "/health": proxyTarget
    }
  }
});
