import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IBVAP Sentinel console. Runs on port 5173 by default and talks to the
// FastAPI backend (backend/main.py, started via run_ecosystem.py) on
// port 8000 — see src/lib/api.js for the base URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
