import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReferrerRoute } from "./components/ReferrerRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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

const PUBLIC_ROUTES = ['/auth', '/login', '/contact', '/apply', '/merchant-apply', '/scoping', '/forgot-password', '/update-password', '/terms-processing', '/affiliate', '/portal', '/support-request', '/.lovable/oauth/consent'];

const InternalWidgets = () => {
  const { pathname } = useLocation();
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return null;
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
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/pipeline" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/opportunities" element={<ProtectedRoute><Opportunities /></ProtectedRoute>} />
                <Route path="/opportunities/:id" element={<ProtectedRoute><OpportunityDetail /></ProtectedRoute>} />
                <Route path="/quotes-contracts" element={<ProtectedRoute><QuotesContracts /></ProtectedRoute>} />
                <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
                <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
                <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/reports/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
                <Route path="/sop" element={<ProtectedRoute><SOP /></ProtectedRoute>} />
                <Route path="/training" element={<ProtectedRoute><Training /></ProtectedRoute>} />
                <Route path="/tools/revenue-calculator" element={<ProtectedRoute><RevenueCalculator /></ProtectedRoute>} />
                <Route path="/tools/preboarding-wizard" element={<ProtectedRoute><PreboardingWizard /></ProtectedRoute>} />
                <Route path="/tools/csv-import" element={<ProtectedRoute><CsvImport /></ProtectedRoute>} />
                <Route path="/tools/quote-builder" element={<ProtectedRoute><QuoteBuilder /></ProtectedRoute>} />
                <Route path="/tools/statement-analysis" element={<ProtectedRoute><StatementAnalysis /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                <Route path="/my-tasks" element={<ProtectedRoute><MyTasks /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/admin/deletion-requests" element={<ProtectedRoute><DeletionRequests /></ProtectedRoute>} />
                <Route path="/admin/data-export" element={<ProtectedRoute><DataExport /></ProtectedRoute>} />
                <Route path="/admin/migration" element={<ProtectedRoute><MigrationChecklist /></ProtectedRoute>} />
                
                <Route path="/admin/web-submissions" element={<ProtectedRoute><WebSubmissions /></ProtectedRoute>} />
                <Route path="/admin/administration" element={<ProtectedRoute><Administration /></ProtectedRoute>} />
                
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/admin/team-roster" element={<ProtectedRoute><TeamRoster /></ProtectedRoute>} />
                <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
                <Route path="/live-billing" element={<ProtectedRoute><LiveBilling /></ProtectedRoute>} />
                <Route path="/live-billing/:id" element={<ProtectedRoute><LiveAccountDetail /></ProtectedRoute>} />
                <Route path="/support" element={<ProtectedRoute><SupportTriage /></ProtectedRoute>} />
                <Route path="/support/:id" element={<ProtectedRoute><SupportTicketDetail /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/tools/nmi-payments" element={<ProtectedRoute><NMIPaymentsExplained /></ProtectedRoute>} />
                <Route path="/tools/gateway-guide" element={<ProtectedRoute><GatewayGuide /></ProtectedRoute>} />
                <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />
                <Route path="/tools/terminal-updates" element={<ProtectedRoute><TerminalUpdates /></ProtectedRoute>} />
                <Route path="/tools/netlify" element={<ProtectedRoute><NetlifyHub /></ProtectedRoute>} />
                <Route path="/tools/nmi-boarding" element={<ProtectedRoute><NMIBoarding /></ProtectedRoute>} />
                <Route path="/tools/kurv" element={<ProtectedRoute><KurvDashboard /></ProtectedRoute>} />
                <Route path="/supported-processors" element={<ProtectedRoute><SupportedProcessors /></ProtectedRoute>} />
                <Route path="/outreach" element={<ProtectedRoute><Outreach /></ProtectedRoute>} />
                <Route path="/outreach/:id" element={<ProtectedRoute><OutreachDetail /></ProtectedRoute>} />
                {/* /leads is the renamed home for Accounts — /accounts stays as an alias for bookmarks */}
                <Route path="/leads" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
                <Route path="/commissions" element={<ProtectedRoute><Commissions /></ProtectedRoute>} />
                <Route path="/admin/affiliates" element={<ProtectedRoute><Referrers /></ProtectedRoute>} />
                <Route path="/admin/referrers" element={<Navigate to="/admin/affiliates" replace />} />
                <Route path="/admin/gateway-accounts" element={<ProtectedRoute><GatewayAccounts /></ProtectedRoute>} />

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
            </TasksProvider>
          </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
