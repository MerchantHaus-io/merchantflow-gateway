import { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Send, DollarSign, LogOut } from "lucide-react";

interface PortalLayoutProps {
  children: ReactNode;
  pageTitle?: string;
  headerActions?: ReactNode;
}

const NAV = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/portal/commissions", label: "Earnings", icon: DollarSign, end: false },
  { to: "/portal/new-referral", label: "Submit Referral", icon: Send, end: false },
];

export function PortalLayout({ children, pageTitle, headerActions }: PortalLayoutProps) {
  const { referrer, signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  // referrer can be null momentarily for internal staff previewing the portal
  const displayName = referrer?.full_name ?? user?.email ?? "Partner";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-4">
          <Link to="/portal" className="flex items-center gap-2">
            <img src="/favicon.png" alt="MerchantHaus" className="h-7 w-7" />
            <span className="font-semibold text-base">Referrer Portal</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium leading-tight">{displayName}</div>
              <div className="text-xs text-muted-foreground leading-tight">{user?.email}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
        <nav className="border-t">
          <div className="max-w-6xl mx-auto px-4 lg:px-6 flex gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 px-3 py-2.5 text-sm border-b-2 whitespace-nowrap transition-colors",
                    isActive
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
          {(pageTitle || headerActions) && (
            <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
              {pageTitle && <h1 className="text-2xl font-semibold">{pageTitle}</h1>}
              {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
            </div>
          )}
          {children}
        </div>
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        MerchantHaus Partner Portal · Need help? Email{" "}
        <a href="mailto:partners@merchanthaus.io" className="underline">partners@merchanthaus.io</a>
      </footer>
    </div>
  );
}
