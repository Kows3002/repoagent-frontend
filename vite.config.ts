import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveApiBaseUrl } from "./src/lib/config";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const previewOrigin = env.VITE_PREVIEW_ORIGIN || "http://*.localhost:8000";
  if (!/^https?:\/\/\*\.[a-zA-Z0-9.-]+(?::\d+)?$/.test(previewOrigin)) {
    throw new Error("VITE_PREVIEW_ORIGIN must be a wildcard preview origin, such as https://*.preview.example.com");
  }
  const apiBaseUrl = resolveApiBaseUrl(env);
  const apiOrigin = apiBaseUrl ? new URL(apiBaseUrl).origin : "";
  const policy = [
    "default-src 'self'",
    "script-src 'self'" + (command === "serve" ? " 'unsafe-inline'" : ""),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' " + apiOrigin + (command === "serve" ? " ws: wss:" : ""),
    "frame-src " + previewOrigin,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  const proxy = {
    target: env.API_PROXY_TARGET || "http://127.0.0.1:8000",
    changeOrigin: true,
  };
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "repoagent-preview-isolation",
        transformIndexHtml() {
          return [{tag:"meta",attrs:{"http-equiv":"Content-Security-Policy",content:policy},injectTo:"head-prepend" as const}];
        },
      },
    ],
    server: { proxy: { "/auth": proxy, "/jobs": proxy } },
  };
});
