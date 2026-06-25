import { useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import type { FeatureKey } from "@/hooks/useFeatureFlags";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const LABELS: Record<FeatureKey, string> = {
  appointments: "Appointments",
  client_portal: "Client portal",
  goals: "Goals",
  reports: "Reports",
  job_chat: "Job Chat",
};

export function DisabledFeatureRedirect({ feature }: { feature: FeatureKey }) {
  const { role } = useAuth();
  const notified = useRef(false);

  useEffect(() => {
    if (notified.current) return;
    notified.current = true;
    toast.info(`${LABELS[feature]} is currently disabled`);
  }, [feature]);

  return <Navigate to={getRoleDashboardPath(role)} replace />;
}

export function ClientPortalUnavailable() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <main className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <CardTitle>Portal temporarily unavailable</CardTitle>
          <CardDescription>
            Your workshop has temporarily disabled client portal access. Your records are safe and will return when access is restored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => navigate("/profile")}>
            <User className="mr-2 h-4 w-4" />
            View profile
          </Button>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
