import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // Vercel handles SPA routing via vercel.json `rewrites`.
    outDir: "dist",
    sourcemap: false,
  },
});
