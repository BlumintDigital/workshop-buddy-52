import { lazy, Suspense, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PwaStatus } from "@/components/PwaStatus";
import { BrandColorProvider } from "@/components/BrandColorProvider";
import {
  FeatureFlagProvider,
  useFeature,
  useFeatureFlags,
  type FeatureKey,
} from "@/hooks/useFeatureFlags";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { ClientPortalUnavailable, DisabledFeatureRedirect } from "@/pages/FeatureUnavailable";

// Always-loaded: auth pages are the entry point
import Auth from "@/pages/Auth";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Demo from "@/pages/Demo";
import NotFound from "./pages/NotFound.tsx";

// Admin pages
const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminJobs = lazy(() => import("@/pages/admin/AdminJobs"));
const AdminAppointments = lazy(() => import("@/pages/admin/AdminAppointments"));
const AdminInventory = lazy(() => import("@/pages/admin/AdminInventory"));
const AdminInvoices = lazy(() => import("@/pages/admin/AdminInvoices"));
const AdminReports = lazy(() => import("@/pages/admin/AdminReports"));
const AdminUsers = lazy(() => import("@/pages/admin/AdminUsers"));
const AdminUserDetail = lazy(() => import("@/pages/admin/AdminUserDetail"));
const AdminClients = lazy(() => import("@/pages/admin/AdminClients"));
const AdminCalendar = lazy(() => import("@/pages/admin/AdminCalendar"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminActivityLogs = lazy(() => import("@/pages/admin/AdminActivityLogs"));
const AdminFeedback = lazy(() => import("@/pages/admin/AdminFeedback"));
const AdminDeployGuide = lazy(() => import("@/pages/admin/AdminDeployGuide"));
const AdminSignupCodes = lazy(() => import("@/pages/admin/AdminSignupCodes"));
const AdminAccessReview = lazy(() => import("@/pages/admin/AdminAccessReview"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));

// Manager pages
const ManagerDashboard = lazy(() => import("@/pages/manager/ManagerDashboard"));
const ManagerJobs = lazy(() => import("@/pages/manager/ManagerJobs"));
const ManagerAppointments = lazy(() => import("@/pages/manager/ManagerAppointments"));
const ManagerInventory = lazy(() => import("@/pages/manager/ManagerInventory"));
const ManagerInvoices = lazy(() => import("@/pages/manager/ManagerInvoices"));
const ManagerStaff = lazy(() => import("@/pages/manager/ManagerStaff"));
const ManagerUserDetail = lazy(() => import("@/pages/manager/ManagerUserDetail"));
const ManagerCalendar = lazy(() => import("@/pages/manager/ManagerCalendar"));

// Staff pages
const StaffDashboard = lazy(() => import("@/pages/staff/StaffDashboard"));
const StaffJobs = lazy(() => import("@/pages/staff/StaffJobs"));
const StaffKanban = lazy(() => import("@/pages/staff/StaffKanban"));
const StaffSchedule = lazy(() => import("@/pages/staff/StaffSchedule"));
const StaffInventory = lazy(() => import("@/pages/staff/StaffInventory"));

// Client pages
const ClientDashboard = lazy(() => import("@/pages/client/ClientDashboard"));
const ClientJobs = lazy(() => import("@/pages/client/ClientJobs"));
const ClientAppointments = lazy(() => import("@/pages/client/ClientAppointments"));
const ClientInvoices = lazy(() => import("@/pages/client/ClientInvoices"));
const ClientRequests = lazy(() => import("@/pages/client/ClientRequests"));
const AdminRequests = lazy(() => import("@/pages/admin/AdminRequests"));

// Shared pages
const JobDetail = lazy(() => import("@/pages/jobs/JobDetail"));
const InvoiceCreate = lazy(() => import("@/pages/invoices/InvoiceCreate"));
const InvoiceDetail = lazy(() => import("@/pages/invoices/InvoiceDetail"));
const UserProfile = lazy(() => import("@/pages/profile/UserProfile"));
const GoalsPage = lazy(() => import("@/pages/goals/GoalsPage"));
const AppointmentDetail = lazy(() => import("@/pages/appointments/AppointmentDetail"));
const ReportIssue = lazy(() => import("@/pages/support/ReportIssue"));
const Help = lazy(() => import("@/pages/Help"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min — most pages share session-scoped data
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function FeatureRoute({ feature, children }: { feature: FeatureKey; children: ReactNode }) {
  const enabled = useFeature(feature);
  const { role } = useAuth();

  if (enabled) return <>{children}</>;
  if (feature === "client_portal" && role === "client") {
    return <ClientPortalUnavailable />;
  }
  return <DisabledFeatureRedirect feature={feature} />;
}

function ClientPortalRoute({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role !== "client") return <>{children}</>;
  return <FeatureRoute feature="client_portal">{children}</FeatureRoute>;
}

function IndexRedirect() {
  const { user, role, loading, mfaCheckPending, needsMfaVerification } = useAuth();
  if (loading || mfaCheckPending) return <LoadingScreen />;
  if (needsMfaVerification) return <Navigate to="/auth" replace />;
  if (user && role) return <Navigate to={getRoleDashboardPath(role)} replace />;
  return <Navigate to="/auth" replace />;
}

function AppRoutes() {
  const { loading } = useFeatureFlags();
  const { user } = useAuth();

  // If Supabase redirected us back with an invite/recovery hash, forward to /reset-password
  if (typeof window !== "undefined" && window.location.hash.includes("type=")) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const t = hashParams.get("type");
    if ((t === "invite" || t === "recovery" || t === "signup") && window.location.pathname !== "/reset-password") {
      window.location.replace(`/reset-password${window.location.hash}`);
      return <LoadingScreen />;
    }
  }

  if (user && loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/" element={<IndexRedirect />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Admin routes */}
      <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/jobs" element={<ProtectedRoute allowedRoles={["admin"]}><AdminJobs /></ProtectedRoute>} />
      <Route path="/admin/appointments" element={<ProtectedRoute allowedRoles={["admin"]}><FeatureRoute feature="appointments"><AdminAppointments /></FeatureRoute></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={["admin"]}><AdminInventory /></ProtectedRoute>} />
      <Route path="/admin/invoices" element={<ProtectedRoute allowedRoles={["admin"]}><AdminInvoices /></ProtectedRoute>} />
      <Route path="/admin/reports" element={<ProtectedRoute allowedRoles={["admin"]}><FeatureRoute feature="reports"><AdminReports /></FeatureRoute></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/users/:userId" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUserDetail /></ProtectedRoute>} />
      <Route path="/admin/clients" element={<ProtectedRoute allowedRoles={["admin"]}><FeatureRoute feature="client_portal"><AdminClients /></FeatureRoute></ProtectedRoute>} />
      <Route path="/admin/calendar" element={<ProtectedRoute allowedRoles={["admin"]}><FeatureRoute feature="appointments"><AdminCalendar /></FeatureRoute></ProtectedRoute>} />
      <Route path="/admin/activity-logs" element={<ProtectedRoute allowedRoles={["admin"]}><AdminActivityLogs /></ProtectedRoute>} />
      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSettings /></ProtectedRoute>} />

      {/* Manager routes */}
      <Route path="/manager/dashboard" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerDashboard /></ProtectedRoute>} />
      <Route path="/manager/jobs" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerJobs /></ProtectedRoute>} />
      <Route path="/manager/appointments" element={<ProtectedRoute allowedRoles={["manager"]}><FeatureRoute feature="appointments"><ManagerAppointments /></FeatureRoute></ProtectedRoute>} />
      <Route path="/manager/inventory" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerInventory /></ProtectedRoute>} />
      <Route path="/manager/invoices" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerInvoices /></ProtectedRoute>} />
      <Route path="/manager/staff" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerStaff /></ProtectedRoute>} />
      <Route path="/manager/staff/:userId" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerUserDetail /></ProtectedRoute>} />
      <Route path="/manager/calendar" element={<ProtectedRoute allowedRoles={["manager"]}><FeatureRoute feature="appointments"><ManagerCalendar /></FeatureRoute></ProtectedRoute>} />

      {/* Staff routes */}
      <Route path="/staff/dashboard" element={<ProtectedRoute allowedRoles={["staff"]}><StaffDashboard /></ProtectedRoute>} />
      <Route path="/staff/jobs" element={<ProtectedRoute allowedRoles={["staff"]}><StaffJobs /></ProtectedRoute>} />
      <Route path="/staff/kanban" element={<ProtectedRoute allowedRoles={["staff"]}><StaffKanban /></ProtectedRoute>} />
      <Route path="/staff/schedule" element={<ProtectedRoute allowedRoles={["staff"]}><FeatureRoute feature="appointments"><StaffSchedule /></FeatureRoute></ProtectedRoute>} />
      <Route path="/staff/inventory" element={<ProtectedRoute allowedRoles={["staff"]}><StaffInventory /></ProtectedRoute>} />

      {/* Client routes */}
      <Route path="/client/dashboard" element={<ProtectedRoute allowedRoles={["client"]}><FeatureRoute feature="client_portal"><ClientDashboard /></FeatureRoute></ProtectedRoute>} />
      <Route path="/client/jobs" element={<ProtectedRoute allowedRoles={["client"]}><FeatureRoute feature="client_portal"><ClientJobs /></FeatureRoute></ProtectedRoute>} />
      <Route path="/client/appointments" element={<ProtectedRoute allowedRoles={["client"]}><FeatureRoute feature="client_portal"><FeatureRoute feature="appointments"><ClientAppointments /></FeatureRoute></FeatureRoute></ProtectedRoute>} />
      <Route path="/client/invoices" element={<ProtectedRoute allowedRoles={["client"]}><FeatureRoute feature="client_portal"><ClientInvoices /></FeatureRoute></ProtectedRoute>} />
      <Route path="/client/requests" element={<ProtectedRoute allowedRoles={["client"]}><FeatureRoute feature="client_portal"><ClientRequests /></FeatureRoute></ProtectedRoute>} />
      <Route path="/admin/requests" element={<ProtectedRoute allowedRoles={["admin"]}><AdminRequests /></ProtectedRoute>} />
      <Route path="/manager/requests" element={<ProtectedRoute allowedRoles={["manager"]}><AdminRequests /></ProtectedRoute>} />


      {/* Shared routes */}
      <Route path="/jobs/:id" element={<ProtectedRoute allowedRoles={["admin", "manager", "staff", "client"]}><ClientPortalRoute><JobDetail /></ClientPortalRoute></ProtectedRoute>} />
      <Route path="/invoices/new" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><InvoiceCreate /></ProtectedRoute>} />
      <Route path="/invoices/:id" element={<ProtectedRoute allowedRoles={["admin", "manager", "client"]}><ClientPortalRoute><InvoiceDetail /></ClientPortalRoute></ProtectedRoute>} />
      <Route path="/goals" element={<ProtectedRoute allowedRoles={["admin", "manager", "staff"]}><FeatureRoute feature="goals"><GoalsPage /></FeatureRoute></ProtectedRoute>} />
      <Route path="/appointments/:id" element={<ProtectedRoute allowedRoles={["admin", "manager", "staff", "client"]}><ClientPortalRoute><FeatureRoute feature="appointments"><AppointmentDetail /></FeatureRoute></ClientPortalRoute></ProtectedRoute>} />
      <Route path="/report-issue" element={<ProtectedRoute allowedRoles={["admin", "manager", "staff", "client"]}><ReportIssue /></ProtectedRoute>} />
      <Route path="/help" element={<ProtectedRoute allowedRoles={["admin", "manager", "staff", "client"]}><Help /></ProtectedRoute>} />
      <Route path="/admin/feedback" element={<ProtectedRoute allowedRoles={["admin"]}><AdminFeedback /></ProtectedRoute>} />
      <Route path="/admin/deploy-guide" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDeployGuide /></ProtectedRoute>} />
      <Route path="/admin/signup-codes" element={<ProtectedRoute allowedRoles={["admin", "manager"]}><AdminSignupCodes /></ProtectedRoute>} />
      <Route path="/admin/access-review" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAccessReview /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute allowedRoles={["admin", "manager", "staff", "client"]}><UserProfile /></ProtectedRoute>} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PwaStatus />
      <BrowserRouter>
        <AuthProvider>
          <FeatureFlagProvider>
            <BrandColorProvider>
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>}>
                <AppRoutes />
              </Suspense>
            </BrandColorProvider>
          </FeatureFlagProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
