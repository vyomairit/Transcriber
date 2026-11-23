import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.BACKEND_URL || "http://localhost:8000";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      // The UI calls /api/*; Vite forwards it to FastAPI so dev needs no CORS.
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
