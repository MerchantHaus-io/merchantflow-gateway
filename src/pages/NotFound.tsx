import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-center max-w-md space-y-6">
        <div className="relative mx-auto w-fit">
          <span className="text-[8rem] font-black leading-none text-primary/10 select-none">404</span>
          <span className="absolute inset-0 flex items-center justify-center text-5xl font-black text-foreground">
            404
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The page <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{location.pathname}</code> doesn't exist or has been moved.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Go Back
          </Button>
          <Button size="sm" asChild>
            <Link to="/">
              <Home className="h-4 w-4 mr-1.5" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
