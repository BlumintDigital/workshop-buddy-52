import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useAuth } from "@/hooks/useAuth";
import { BroadcastBanner } from "@/components/BroadcastBanner";
import { SystemNoticesBanner } from "@/components/SystemNoticesBanner";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShieldAlert } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { mfaEnabled, loading, role } = useAuth();
  const navigate = useNavigate();
  const prompted = useRef(false);

  const isPrivileged = role === "admin" || role === "manager";
  const showModal = !loading && !mfaEnabled && isPrivileged && !prompted.current;

  const handleSetUpNow = () => {
    prompted.current = true;
    navigate("/profile");
  };

  const handleRemindLater = () => {
    prompted.current = true;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <BroadcastBanner />
          <SystemNoticesBanner />


          {/* 2FA reminder banner — shown to all users without 2FA */}
          {!loading && !mfaEnabled && (
            <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Your account doesn't have two-factor authentication enabled. Enable it to keep your account secure.</span>
              </div>
              <Link to="/profile">
                <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40 shrink-0">
                  Enable 2FA
                </Button>
              </Link>
            </div>
          )}

          <main className="flex-1 p-3 sm:p-6">{children}</main>
          <footer className="border-t py-3 px-6 text-xs text-muted-foreground text-center">
            Shoplane is powered by Blumint Workspace · © {new Date().getFullYear()} Blumint Digital Limited · Registered in England and Wales · Company No. 15709531
          </footer>
        </SidebarInset>
      </div>

      {/* Blocking modal for admin/manager — once per session */}
      <AlertDialog open={showModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Two-factor authentication required
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your role requires two-factor authentication to be enabled. Please set it up now to protect your account and the data you have access to.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleRemindLater}>
              Remind me later
            </Button>
            <Button onClick={handleSetUpNow}>
              Set up 2FA now
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
