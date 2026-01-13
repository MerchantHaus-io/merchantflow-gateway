import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TasksProvider } from "@/contexts/TasksContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
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
import Chat from "./pages/Chat";
import NMIPaymentsExplained from "./pages/NMIPaymentsExplained";
import WebSubmissions from "./pages/WebSubmissions";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <TasksProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/update-password" element={<UpdatePassword />} />
                <Route path="/apply" element={<Apply />} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/opportunities" element={<ProtectedRoute><Opportunities /></ProtectedRoute>} />
                <Route path="/opportunities/:id" element={<ProtectedRoute><OpportunityDetail /></ProtectedRoute>} />
                <Route path="/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
                <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
                <Route path="/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
                <Route path="/sop" element={<ProtectedRoute><SOP /></ProtectedRoute>} />
                <Route path="/tools/revenue-calculator" element={<ProtectedRoute><RevenueCalculator /></ProtectedRoute>} />
                <Route path="/tools/preboarding-wizard" element={<ProtectedRoute><PreboardingWizard /></ProtectedRoute>} />
                <Route path="/tools/csv-import" element={<ProtectedRoute><CsvImport /></ProtectedRoute>} />
                <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
                <Route path="/my-tasks" element={<ProtectedRoute><MyTasks /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/admin/deletion-requests" element={<ProtectedRoute><DeletionRequests /></ProtectedRoute>} />
                <Route path="/admin/data-export" element={<ProtectedRoute><DataExport /></ProtectedRoute>} />
                
                {/* ADMIN ROUTE */}
                <Route path="/admin/web-submissions" element={<ProtectedRoute><WebSubmissions /></ProtectedRoute>} />
                
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                <Route path="/tools/nmi-payments" element={<ProtectedRoute><NMIPaymentsExplained /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </TasksProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
