import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateTeamRosterFromDb } from "@/config/team";

// Load the live team roster from the database (admins edit it from
// Settings → Team Roster). Fire-and-forget — code defaults stand in until ready.
void hydrateTeamRosterFromDb();

const splash = document.getElementById("splash-loader");
if (splash) {
  splash.style.opacity = "0";
  setTimeout(() => splash.remove(), 400);
}

createRoot(document.getElementById("root")!).render(<App />);
