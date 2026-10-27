import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileSearch, Settings, LogOut } from "lucide-react";

const NAV = [
  { to: "/cases", label: "Cases", icon: FileSearch },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { org, settings } = useTenant();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link to="/cases" className="flex items-center gap-2 font-semibold">
              {settings?.logo_url ? (
                <img src={settings.logo_url} alt="" className="h-7 w-auto" />
              ) : (
                <span className="grid h-7 w-7 place-items-center rounded bg-primary text-primary-foreground">
                  <FileSearch className="h-4 w-4" />
                </span>
              )}
              <span>{settings?.product_name || "Underwriting"}</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                    location.pathname.startsWith(to) && "bg-accent text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {org && <span className="hidden text-sm text-muted-foreground sm:inline">{org.name}</span>}
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
