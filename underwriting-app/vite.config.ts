import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Standalone underwriting app. No Lovable/CRM plugins — this project is designed
// to be lifted into its own repo unchanged.
export default defineConfig({
  server: {
    host: "::",
    port: 8090,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
