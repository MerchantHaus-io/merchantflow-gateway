import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Suspense } from "react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { AuthProvider } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ReferrerRoute } from "./components/ReferrerRoute";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary, RouteErrorBoundary } from "@/components/ErrorBoundary";
import { isPathWithin } from "@/lib/routeMatch";

// Pages are lazy-loaded so each route ships as its own chunk, keeping the
// initial bundle small and deferring heavy deps (three/jspdf/mammoth/recharts)
// until the route that needs them is actually visited.
const Index = lazy(() => import("./pages/Index"));
const Home = lazy(() => import("./pages/Home"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Accounts = lazy(() => import("./pages/Accounts"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Documents = lazy(() => import("./pages/Documents"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const TeamRoster = lazy(() => import("./pages/TeamRoster"));
const Auth = lazy(() => import("./pages/Auth"));
const Login = lazy(() => import("./pages/Login"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const Connect = lazy(() => import("./pages/Connect"));


const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const Apply = lazy(() => import("./pages/Apply"));
const Contact = lazy(() => import("./pages/Contact"));
const SOP = lazy(() => import("./pages/SOP"));
const Training = lazy(() => import("./pages/Training"));
const RevenueCalculator = lazy(() => import("./pages/RevenueCalculator"));
const PreboardingWizard = lazy(() => import("./pages/PreboardingWizard"));
const Tasks = lazy(() => import("./pages/Tasks"));
const MyTasks = lazy(() => import("./pages/MyTasks"));
const CsvImport = lazy(() => import("./pages/CsvImport"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DeletionRequests = lazy(() => import("./pages/DeletionRequests"));
const DataExport = lazy(() => import("./pages/DataExport"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const OpportunityDetail = lazy(() => import("./pages/OpportunityDetail"));
const NMIPaymentsExplained = lazy(() => import("./pages/NMIPaymentsExplained"));
const GatewayGuide = lazy(() => import("./pages/GatewayGuide"));
const Pricing = lazy(() => import("./pages/Pricing"));
const TerminalUpdates = lazy(() => import("./pages/TerminalUpdates"));
const WebSubmissions = lazy(() => import("./pages/WebSubmissions"));
const MerchantApply = lazy(() => import("./pages/MerchantApply"));
const Scoping = lazy(() => import("./pages/Scoping"));
const TermsProcessing = lazy(() => import("./pages/TermsProcessing"));
const LiveBilling = lazy(() => import("./pages/LiveBilling"));
const LiveAccountDetail = lazy(() => import("./pages/LiveAccountDetail"));
const SupportedProcessors = lazy(() => import("./pages/SupportedProcessors"));
const Administration = lazy(() => import("./pages/Administration"));
const Outreach = lazy(() => import("./pages/Outreach"));
const OutreachDetail = lazy(() => import("./pages/OutreachDetail"));
const NetlifyHub = lazy(() => import("./pages/NetlifyHub"));
const NMIBoarding = lazy(() => import("./pages/NMIBoarding"));
const KurvDashboard = lazy(() => import("./pages/KurvDashboard"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Transactions = lazy(() => import("./pages/Transactions"));
const GatewayAccounts = lazy(() => import("./pages/GatewayAccounts"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Commissions = lazy(() => import("./pages/Commissions"));
const QuoteBuilder = lazy(() => import("./pages/QuoteBuilder"));
const StatementAnalysis = lazy(() => import("./pages/StatementAnalysis"));
const QuoteAcceptance = lazy(() => import("./pages/QuoteAcceptance"));
const QuotesContracts = lazy(() => import("./pages/QuotesContracts"));
const Referrers = lazy(() => import("./pages/Referrers"));
const PortalDashboard = lazy(() => import("./pages/portal/PortalDashboard"));
const PortalNewReferral = lazy(() => import("./pages/portal/PortalNewReferral"));
const PortalCommissions = lazy(() => import("./pages/portal/PortalCommissions"));
const SupportTriage = lazy(() => import("./pages/SupportTriage"));
const SupportTicketDetail = lazy(() => import("./pages/SupportTicketDetail"));
const SupportRequest = lazy(() => import("./pages/SupportRequest"));
const MigrationChecklist = lazy(() => import("./pages/MigrationChecklist"));
import { IncomingCallToast } from "./components/IncomingCallToast";
import { IncomingMessageToast } from "./components/IncomingMessageToast";
import { Dialler } from "./components/Dialler";
import { CommandPalette } from "./components/CommandPalette";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { AdminPopupDisplay } from "./components/AdminPopupDisplay";
import { EmailSendConfirm } from "./components/EmailSendConfirm";
import { PatchNotesPopup } from "./components/PatchNotesPopup";

// Routes that must never mount internal staff furniture (dialler, command
// palette, admin popups, patch notes…). `/q/:token` is the merchant-facing
// quote-acceptance and signing page — it is public and must stay clean.
const PUBLIC_ROUTES = ['/auth', '/login', '/contact', '/apply', '/merchant-apply', '/scoping', '/forgot-password', '/update-password', '/terms-processing', '/affiliate', '/portal', '/support-request', '/q', '/.lovable/oauth/consent'];

// Match on whole path segments, not raw prefixes: a bare startsWith() makes
// `/contacts` match `/contact` and `/quotes-contracts` match `/q`, silently
// stripping the internal widgets from staff pages.
const isPublicRoute = (pathname: string) =>
  PUBLIC_ROUTES.some(r => isPathWithin(pathname, r));

const InternalWidgets = () => {
  const { pathname } = useLocation();
  if (isPublicRoute(pathname)) return null;
  return (
    <>
      <IncomingCallToast />
      <IncomingMessageToast />
      <Dialler />
      <CommandPalette />
      <KeyboardShortcutsModal />
      <AdminPopupDisplay />
      <PatchNotesPopup />
      <EmailSendConfirm />
    </>
  );
};

// Public routes (auth, apply, the merchant quote page) have no shell, so a
// full-screen fallback is the right shape for them. Internal pages suspend
// against AppShell's own boundary instead, which keeps the chrome on screen —
// see the comment there (#102).
const RouteFallback = () => (
  <div className="flex h-screen w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,     // 2 minutes before refetch
      retry: 1,                       // Single retry on failure
      refetchOnWindowFocus: false,    // Prevent unnecessary refetches
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
          <AuthProvider>
            <TasksProvider>
              <InternalWidgets />
              {/* Inner boundary is scoped to the routed page and clears itself
                  on navigation, so a crash in one page doesn't strand the user
                  on the error screen. The outer boundary still catches failures
                  in the providers above it. */}
              <RouteErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/login" element={<Login />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />

                <Route path="/update-password" element={<UpdatePassword />} />
                <Route path="/apply" element={<Apply />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/merchant-apply" element={<MerchantApply />} />
                <Route path="/scoping" element={<Scoping />} />
                <Route path="/terms-processing" element={<TermsProcessing />} />
                <Route path="/support-request" element={<SupportRequest />} />
                <Route path="/q/:token" element={<QuoteAcceptance />} />
                {/* Every authenticated internal page renders inside AppShell,
                    which mounts the header, icon rail, chat and docks ONCE.
                    Previously each page rendered its own AppLayout, so all of
                    that chrome was destroyed and rebuilt on every navigation —
                    which is what made a menu click feel like a full reload.
                    ProtectedRoute lives inside AppShell, so the auth check no
                    longer remounts per route either (audit #2). */}
                <Route element={<AppShell />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/pipeline" element={<Index />} />
                  <Route path="/dashboard" element={<Home />} />
                  <Route path="/opportunities" element={<Opportunities />} />
                  <Route path="/opportunities/:id" element={<OpportunityDetail />} />
                  <Route path="/quotes-contracts" element={<QuotesContracts />} />
                  <Route path="/accounts" element={<Accounts />} />
                  <Route path="/contacts" element={<Contacts />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/reports/transactions" element={<Transactions />} />
                  <Route path="/sop" element={<SOP />} />
                  <Route path="/training" element={<Training />} />
                  <Route path="/tools/revenue-calculator" element={<RevenueCalculator />} />
                  <Route path="/tools/preboarding-wizard" element={<PreboardingWizard />} />
                  <Route path="/tools/csv-import" element={<CsvImport />} />
                  <Route path="/tools/quote-builder" element={<QuoteBuilder />} />
                  <Route path="/tools/statement-analysis" element={<StatementAnalysis />} />
                  <Route path="/tasks" element={<Tasks />} />
                  <Route path="/my-tasks" element={<MyTasks />} />
                  <Route path="/notifications" element={<Notifications />} />
                  <Route path="/admin/deletion-requests" element={<DeletionRequests />} />
                  <Route path="/admin/data-export" element={<DataExport />} />
                  <Route path="/admin/migration" element={<MigrationChecklist />} />
                
                  <Route path="/admin/web-submissions" element={<WebSubmissions />} />
                  <Route path="/admin/administration" element={<Administration />} />
                
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/connect" element={<Connect />} />

                  <Route path="/admin/team-roster" element={<TeamRoster />} />
                  <Route path="/integrations" element={<Integrations />} />
                  <Route path="/live-billing" element={<LiveBilling />} />
                  <Route path="/live-billing/:id" element={<LiveAccountDetail />} />
                  <Route path="/support" element={<SupportTriage />} />
                  <Route path="/support/:id" element={<SupportTicketDetail />} />
                  <Route path="/chat" element={<Home />} />
                  <Route path="/tools/nmi-payments" element={<NMIPaymentsExplained />} />
                  <Route path="/tools/gateway-guide" element={<GatewayGuide />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/tools/terminal-updates" element={<TerminalUpdates />} />
                  <Route path="/tools/netlify" element={<NetlifyHub />} />
                  <Route path="/tools/nmi-boarding" element={<NMIBoarding />} />
                  <Route path="/tools/kurv" element={<KurvDashboard />} />
                  <Route path="/supported-processors" element={<SupportedProcessors />} />
                  <Route path="/outreach" element={<Outreach />} />
                  <Route path="/outreach/:id" element={<OutreachDetail />} />
                  {/* /leads is the renamed home for Accounts — /accounts stays as an alias for bookmarks */}
                  <Route path="/leads" element={<Accounts />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/commissions" element={<Commissions />} />
                  <Route path="/admin/affiliates" element={<Referrers />} />
                  <Route path="/admin/referrers" element={<Navigate to="/admin/affiliates" replace />} />
                  <Route path="/admin/gateway-accounts" element={<GatewayAccounts />} />
                </Route>

                {/* Affiliate portal — external partners */}
                <Route path="/affiliate" element={<ReferrerRoute><PortalDashboard /></ReferrerRoute>} />
                <Route path="/affiliate/new-referral" element={<ReferrerRoute><PortalNewReferral /></ReferrerRoute>} />
                <Route path="/affiliate/commissions" element={<ReferrerRoute><PortalCommissions /></ReferrerRoute>} />
                {/* Legacy /portal redirects */}
                <Route path="/portal" element={<Navigate to="/affiliate" replace />} />
                <Route path="/portal/new-referral" element={<Navigate to="/affiliate/new-referral" replace />} />
                <Route path="/portal/commissions" element={<Navigate to="/affiliate/commissions" replace />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              </RouteErrorBoundary>
            </TasksProvider>
          </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
