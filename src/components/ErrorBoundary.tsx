import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /**
   * When any value in this array changes, the boundary clears its error state.
   * Used to reset on navigation so a crash on one page doesn't strand the user
   * on the error screen for the rest of the session.
   */
  resetKeys?: unknown[];
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const keysChanged = (a: unknown[] = [], b: unknown[] = []) =>
  a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));

/**
 * Error Boundary — catches unhandled React rendering errors and displays a
 * branded recovery screen instead of a white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.setState({ hasError: false, error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Your data is safe — try refreshing the page.
              </p>
            </div>
            {this.state.error && (
              <div className="bg-muted rounded-lg p-3 text-left">
                <p className="text-xs font-mono text-muted-foreground break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={this.handleRetry}>
                Try Again
              </Button>
              <Button onClick={this.handleReload}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Route-scoped boundary: same UI, but clears itself whenever the URL changes.
 * Sits inside the router so a crash in one page is recoverable by navigating
 * away, rather than requiring a hard reload.
 */
export const RouteErrorBoundary = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  return <ErrorBoundary resetKeys={[location.pathname]}>{children}</ErrorBoundary>;
};
