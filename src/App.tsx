import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Accounts from "./pages/Accounts";
import Contacts from "./pages/Contacts";
import Documents from "./pages/Documents";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";
import Apply from "./pages/Apply";
import Contact from "./pages/Contact";
import SOP from "./pages/SOP";
import RevenueCalculator from "./pages/RevenueCalculator";
import PreboardingWizard from "./pages/PreboardingWizard";
import Tasks from "./pages/Tasks";
import MyTasks from "./pages/MyTasks";
import CsvImport from "./pages/CsvImport";
import Notifications from "./pages/Notifications";
import DeletionRequests from "./pages/DeletionRequests";
import DataExport from "./pages/DataExport";
import Opportunities from "./pages/Opportunities";
import OpportunityDetail from "./pages/OpportunityDetail";

import NMIPaymentsExplained from "./pages/NMIPaymentsExplained";
import GatewayGuide from "./pages/GatewayGuide";
import TerminalUpdates from "./pages/TerminalUpdates";
import WebSubmissions from "./pages/WebSubmissions";
import MerchantApply from "./pages/MerchantApply";
import TermsProcessing from "./pages/TermsProcessing";
import LiveBilling from "./pages/LiveBilling";
import LiveAccountDetail from "./pages/LiveAccountDetail";
import SupportedProcessors from "./pages/SupportedProcessors";
import Administration from "./pages/Administration";
import Outreach from "./pages/Outreach";
import OutreachDetail from "./pages/OutreachDetail";
import NetlifyHub from "./pages/NetlifyHub";
import NMIBoarding from "./pages/NMIBoarding";
import Leads from "./pages/Leads";
import Transactions from "./pages/Transactions";
import Calendar from "./pages/Calendar";
import { IncomingCallToast } from "./components/IncomingCallToast";
import { IncomingMessageToast } from "./components/IncomingMessageToast";
import { Dialler } from "./components/Dialler";
import { CommandPalette } from "./components/CommandPalette";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { AdminPopupDisplay } from "./components/AdminPopupDisplay";

const PUBLIC_ROUTES = ['/auth', '/login', '/contact', '/apply', '/merchant-apply', '/forgot-password', '/update-password', '/terms-processing'];

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
    </>
  );
};

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
              <Routes>
                {/* Public routes */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/update-password" element={<UpdatePassword />} />
                <Route path="/apply" element={<Apply />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="/merchant-apply" element={<MerchantApply />} />
                <Route path="/terms-processing" element={<TermsProcessing />} />
                <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/pipeline" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/opportunities" element={<ProtectedRoute><Opportunities /></ProtectedRoute>} />
                <Route path="/opportunities/:id" element={<ProtectedRoute><OpportunityDetail /></ProtectedRoute>} />
                <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
                <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
                <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/reports/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
                <Route path="/sop" element={<ProtectedRoute><SOP /></ProtectedRoute>} />
                <Route path="/tools/revenue-calculator" element={<ProtectedRoute><RevenueCalculator /></ProtectedRoute>} />
                <Route path="/tools/preboarding-wizard" element={<ProtectedRoute><PreboardingWizard /></ProtectedRoute>} />
                <Route path="/tools/csv-import" element={<ProtectedRoute><CsvImport /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                <Route path="/my-tasks" element={<ProtectedRoute><MyTasks /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/admin/deletion-requests" element={<ProtectedRoute><DeletionRequests /></ProtectedRoute>} />
                <Route path="/admin/data-export" element={<ProtectedRoute><DataExport /></ProtectedRoute>} />
                
                <Route path="/admin/web-submissions" element={<ProtectedRoute><WebSubmissions /></ProtectedRoute>} />
                <Route path="/admin/administration" element={<ProtectedRoute><Administration /></ProtectedRoute>} />
                
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/live-billing" element={<ProtectedRoute><LiveBilling /></ProtectedRoute>} />
                <Route path="/live-billing/:id" element={<ProtectedRoute><LiveAccountDetail /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                <Route path="/tools/nmi-payments" element={<ProtectedRoute><NMIPaymentsExplained /></ProtectedRoute>} />
                <Route path="/tools/gateway-guide" element={<ProtectedRoute><GatewayGuide /></ProtectedRoute>} />
                <Route path="/tools/terminal-updates" element={<ProtectedRoute><TerminalUpdates /></ProtectedRoute>} />
                <Route path="/tools/netlify" element={<ProtectedRoute><NetlifyHub /></ProtectedRoute>} />
                <Route path="/tools/nmi-boarding" element={<ProtectedRoute><NMIBoarding /></ProtectedRoute>} />
                <Route path="/supported-processors" element={<ProtectedRoute><SupportedProcessors /></ProtectedRoute>} />
                <Route path="/outreach" element={<ProtectedRoute><Outreach /></ProtectedRoute>} />
                <Route path="/outreach/:id" element={<ProtectedRoute><OutreachDetail /></ProtectedRoute>} />
                <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
                <Route path="/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TasksProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
