import DashboardLayout from "@/components/layout/DashboardLayout";
import { TodayDashboard } from "@/components/dashboard/TodayDashboard";

export default function ManagerDashboard() {
  return (
    <DashboardLayout>
      <TodayDashboard role="manager" />
    </DashboardLayout>
  );
}
