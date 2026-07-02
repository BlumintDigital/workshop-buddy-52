import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type AppRole = "admin" | "manager" | "staff" | "client";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading, mfaCheckPending, needsMfaVerification, signOut } = useAuth();

  // Hold while auth state is loading or the MFA requirement is still being
  // evaluated — otherwise the dashboard can flash before the 2FA redirect.
  if (loading || mfaCheckPending) {
    return <LoadingScreen />;
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (needsMfaVerification) {
    return <Navigate to="/auth" replace />;
  }

  // Auth completed but the account has no role row. Don't hang on the loader —
  // surface the problem so the user can sign out and contact an admin.
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full rounded-lg border bg-card p-6 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-semibold">No role assigned</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have a role yet. Please contact an administrator to be granted access.
          </p>
          <Button onClick={() => signOut()} variant="outline" className="w-full">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={`/${role}/dashboard`} replace />;
  }

  return <>{children}</>;
}

