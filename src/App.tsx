import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "@/pages/Auth";
import NotFound from "./pages/NotFound.tsx";

// Admin pages
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminJobs from "@/pages/admin/AdminJobs";
import AdminAppointments from "@/pages/admin/AdminAppointments";
import AdminInventory from "@/pages/admin/AdminInventory";
import AdminInvoices from "@/pages/admin/AdminInvoices";
import AdminUsers from "@/pages/admin/AdminUsers";
import AdminSettings from "@/pages/admin/AdminSettings";

// Manager pages
import ManagerDashboard from "@/pages/manager/ManagerDashboard";
import ManagerJobs from "@/pages/manager/ManagerJobs";
import ManagerAppointments from "@/pages/manager/ManagerAppointments";
import ManagerInventory from "@/pages/manager/ManagerInventory";
import ManagerInvoices from "@/pages/manager/ManagerInvoices";
import ManagerStaff from "@/pages/manager/ManagerStaff";

// Staff pages
import StaffDashboard from "@/pages/staff/StaffDashboard";
import StaffJobs from "@/pages/staff/StaffJobs";
import StaffSchedule from "@/pages/staff/StaffSchedule";
import StaffInventory from "@/pages/staff/StaffInventory";

// Client pages
import ClientDashboard from "@/pages/client/ClientDashboard";
import ClientJobs from "@/pages/client/ClientJobs";
import ClientAppointments from "@/pages/client/ClientAppointments";
import ClientInvoices from "@/pages/client/ClientInvoices";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<Auth />} />

            {/* Admin routes */}
            <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/jobs" element={<ProtectedRoute allowedRoles={["admin"]}><AdminJobs /></ProtectedRoute>} />
            <Route path="/admin/appointments" element={<ProtectedRoute allowedRoles={["admin"]}><AdminAppointments /></ProtectedRoute>} />
            <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={["admin"]}><AdminInventory /></ProtectedRoute>} />
            <Route path="/admin/invoices" element={<ProtectedRoute allowedRoles={["admin"]}><AdminInvoices /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={["admin"]}><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={["admin"]}><AdminSettings /></ProtectedRoute>} />

            {/* Manager routes */}
            <Route path="/manager/dashboard" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerDashboard /></ProtectedRoute>} />
            <Route path="/manager/jobs" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerJobs /></ProtectedRoute>} />
            <Route path="/manager/appointments" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerAppointments /></ProtectedRoute>} />
            <Route path="/manager/inventory" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerInventory /></ProtectedRoute>} />
            <Route path="/manager/invoices" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerInvoices /></ProtectedRoute>} />
            <Route path="/manager/staff" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerStaff /></ProtectedRoute>} />

            {/* Staff routes */}
            <Route path="/staff/dashboard" element={<ProtectedRoute allowedRoles={["staff"]}><StaffDashboard /></ProtectedRoute>} />
            <Route path="/staff/jobs" element={<ProtectedRoute allowedRoles={["staff"]}><StaffJobs /></ProtectedRoute>} />
            <Route path="/staff/schedule" element={<ProtectedRoute allowedRoles={["staff"]}><StaffSchedule /></ProtectedRoute>} />
            <Route path="/staff/inventory" element={<ProtectedRoute allowedRoles={["staff"]}><StaffInventory /></ProtectedRoute>} />

            {/* Client routes */}
            <Route path="/client/dashboard" element={<ProtectedRoute allowedRoles={["client"]}><ClientDashboard /></ProtectedRoute>} />
            <Route path="/client/jobs" element={<ProtectedRoute allowedRoles={["client"]}><ClientJobs /></ProtectedRoute>} />
            <Route path="/client/appointments" element={<ProtectedRoute allowedRoles={["client"]}><ClientAppointments /></ProtectedRoute>} />
            <Route path="/client/invoices" element={<ProtectedRoute allowedRoles={["client"]}><ClientInvoices /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
