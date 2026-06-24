import { useAuth, SESSION_TIMEOUT_MS } from "@/hooks/useAuth";
import { Clock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SessionIndicator() {
  const { sessionTimeLeft, extendSession, signOut, user } = useAuth();
  const [showWarning, setShowWarning] = useState(false);

  const isUrgent = sessionTimeLeft <= 120_000; // 2 min
  const isWarning = sessionTimeLeft <= 300_000; // 5 min

  useEffect(() => {
    if (isUrgent && user) {
      setShowWarning(true);
    }
    if (!isUrgent) {
      setShowWarning(false);
    }
  }, [isUrgent, user]);

  // Only surface the indicator when the session is actually approaching expiry
  if (!user || !isWarning) return null;

  const colorClass = isUrgent ? "text-destructive" : "text-yellow-500";

  const handleExtend = () => {
    extendSession();
    setShowWarning(false);
  };

  return (
    <>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${colorClass} transition-colors`}>
        <Clock className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{formatTime(sessionTimeLeft)}</span>
        <Progress
          value={(sessionTimeLeft / SESSION_TIMEOUT_MS) * 100}
          className="h-1.5 w-12 hidden sm:block"
        />
      </div>

      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
            <AlertDialogDescription>
              Your session will expire in {formatTime(sessionTimeLeft)} due to inactivity.
              Would you like to stay logged in?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => signOut()}>Log Out</AlertDialogCancel>
            <AlertDialogAction onClick={handleExtend}>Stay Logged In</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
