import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
  build: {
    // Vercel handles SPA routing via vercel.json `rewrites`.
    outDir: "dist",
    sourcemap: false,
  },
});
