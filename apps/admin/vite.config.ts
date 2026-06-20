import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const adminDir = path.dirname(fileURLToPath(import.meta.url));
const coreRoot = path.resolve(adminDir, "../..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, coreRoot, "");
  const apiTarget = `http://localhost:${env.PORT || "3000"}`;

  const proxy = {
    "/v1": {
      target: apiTarget,
      changeOrigin: true,
    },
    "/health": {
      target: apiTarget,
      changeOrigin: true,
    },
  };

  return {
    root: adminDir,
    plugins: [react()],
    // Evita crash do dep optimizer (Vite 6 + paths OneDrive) no Windows local.
    // include obrigatório com noDiscovery — sem isso o React não carrega no browser (CI/Linux).
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react-router",
        "react-router-dom",
        "@tanstack/react-query",
      ],
    },
    server: {
      port: 5173,
      host: "127.0.0.1",
      strictPort: true,
      proxy,
    },
    preview: {
      port: 5173,
      host: "127.0.0.1",
      strictPort: true,
      proxy,
    },
  };
});
