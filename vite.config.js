import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    watch: {
      usePolling: true,
      interval: 1000
    },
    historyApiFallback: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5055",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist"
  }
});
