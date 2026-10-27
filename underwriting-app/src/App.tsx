import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { TenantBrandProvider } from "@/components/layout/TenantBrandProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Spinner } from "@/components/ui/spinner";

const Login = lazy(() => import("@/pages/auth/Login"));
const SignUp = lazy(() => import("@/pages/auth/SignUp"));
const AcceptInvite = lazy(() => import("@/pages/auth/AcceptInvite"));
const CreateOrgPage = lazy(() => import("@/pages/onboarding/CreateOrgPage"));
const CasesPage = lazy(() => import("@/pages/cases/CasesPage"));
const CaseDetailPage = lazy(() => import("@/pages/cases/CaseDetailPage"));
const TenantSettingsPage = lazy(() => import("@/pages/settings/TenantSettingsPage"));
const MembersPage = lazy(() => import("@/pages/settings/MembersPage"));
const BillingPage = lazy(() => import("@/pages/settings/BillingPage"));

const queryClient = new QueryClient();

function Fallback() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function protect(el: ReactNode) {
  return <ProtectedRoute>{el}</ProtectedRoute>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <TenantBrandProvider>
              <Toaster position="top-right" richColors />
              <Suspense fallback={<Fallback />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/signup" element={<SignUp />} />
                  <Route path="/accept-invite" element={<AcceptInvite />} />
                  <Route path="/create-org" element={<CreateOrgPage />} />
                  <Route path="/cases" element={protect(<CasesPage />)} />
                  <Route path="/cases/:id" element={protect(<CaseDetailPage />)} />
                  <Route path="/settings" element={protect(<TenantSettingsPage />)} />
                  <Route path="/settings/members" element={protect(<MembersPage />)} />
                  <Route path="/settings/billing" element={protect(<BillingPage />)} />
                  <Route path="/" element={<Navigate to="/cases" replace />} />
                  <Route path="*" element={<Navigate to="/cases" replace />} />
                </Routes>
              </Suspense>
            </TenantBrandProvider>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
