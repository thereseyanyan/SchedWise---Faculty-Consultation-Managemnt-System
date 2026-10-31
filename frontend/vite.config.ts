import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

// The one-click launcher runs the PHP API on this local port. Apache is not
// required. Override with VITE_PROXY_TARGET when using a different server.
const proxyTarget = process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8000"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    // Forward /api/* to the PHP backend so cookies stay same-origin in development.
    // The backend folder itself is the API root, so the /api prefix is stripped.
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
})
