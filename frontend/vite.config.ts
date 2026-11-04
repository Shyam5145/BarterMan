import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

// In development the Express API runs separately; proxy /api and the chat socket so the browser sees one origin.
const apiProxy = {
  "/api": { target: "http://localhost:5000", changeOrigin: true },
  "/socket.io": { target: "http://localhost:5000", changeOrigin: true, ws: true },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 8443,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: "0.0.0.0",
    port: 8443,
    proxy: apiProxy,
  },
})
