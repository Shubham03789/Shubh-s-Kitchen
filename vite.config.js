import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function localApi() {
  return {
    name: "local-api",
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), "");
      for (const [name, value] of Object.entries(env)) {
        if (process.env[name] === undefined) process.env[name] = value;
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (pathname !== "/api" && !pathname.startsWith("/api/")) return next();
        try {
          const adapterUrl = pathToFileURL(path.resolve("server/node-adapter.js")).href;
          const { handleNodeRequest } = await import(adapterUrl);
          await handleNodeRequest(req, res);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
