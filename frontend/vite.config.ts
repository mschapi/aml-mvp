import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: process.env.VITE_PUBLIC_DEMO === "true" ? "/aml-mvp/" : "/",
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8001" } },
});
