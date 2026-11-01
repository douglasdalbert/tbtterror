import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.APP_NODE_ENV": JSON.stringify(
      process.env.TERROR_NODE_ENV
        ?? loadEnv(mode, fileURLToPath(new URL("../../", import.meta.url)), "NODE_ENV").NODE_ENV
        ?? "development",
    ),
  },
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/socket.io": { target: "http://127.0.0.1:3000", ws: true },
    },
  },
}));
