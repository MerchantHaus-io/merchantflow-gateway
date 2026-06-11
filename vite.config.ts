import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest dependencies into their own long-term-cacheable
        // chunks so they don't bloat the main bundle and only download when a
        // route that needs them is loaded.
        manualChunks: {
          three: ["three"],
          pdf: ["jspdf", "jspdf-autotable", "html2canvas"],
          charts: ["recharts"],
          docx: ["mammoth"],
          // Stable core libraries change rarely — keep them in one long-lived
          // vendor chunk so app deploys don't invalidate them in the browser cache.
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
}));
