import DashboardLayout from "@/components/layout/DashboardLayout";
import { TodayDashboard } from "@/components/dashboard/TodayDashboard";

export default function AdminDashboard() {
  return (
    <DashboardLayout>
      <TodayDashboard role="admin" />
    </DashboardLayout>
  );
}
