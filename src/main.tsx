// Self-hosted brand fonts (#85/#86). Bundled rather than fetched from Google
// or fonts.cdnfonts.com, so there is no render-blocking third-party request.
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/600.css';
import { createRoot } from "react-dom/client";
import { installGlobalErrorHandlers } from "@/lib/telemetry";
import App from "./App.tsx";
import "./index.css";
import { hydrateTeamRosterFromDb } from "@/config/team";
import { bootstrapImpersonation } from "@/integrations/supabase/impersonationBootstrap";

// Load the live team roster from the database (admins edit it from
// Settings → Team Roster). Fire-and-forget — code defaults stand in until ready.
void hydrateTeamRosterFromDb();

const splash = document.getElementById("splash-loader");
if (splash) {
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 400);
}

// Bootstrap admin-impersonation BEFORE mounting React so AuthProvider sees the
// correct (isolated) session on its first render. No-op for normal sessions.
void bootstrapImpersonation().finally(() => {
  // Catches async throws and rejected promises, which never reach ErrorBoundary.
  installGlobalErrorHandlers();
  createRoot(document.getElementById("root")!).render(<App />);
});
