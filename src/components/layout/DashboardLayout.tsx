import { createContext, Suspense, useContext, useState, type ReactNode } from "react";
import { Link, Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileTabBar } from "./MobileTabBar";
import { useAuth } from "@/hooks/useAuth";
import { NavCountsProvider } from "@/hooks/useNavCounts";
import { BroadcastBanner } from "@/components/BroadcastBanner";
import { SystemNoticesBanner } from "@/components/SystemNoticesBanner";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

const MFA_SNOOZE_KEY = "mfa-reminder-snoozed-until";
const MFA_SNOOZE_DAYS = 7;

/** True while rendering inside the persistent app shell, so nested DashboardLayouts don't mount a second one. */
const ShellContext = createContext(false);

function readSnooze(): number {
  try {
    return Number(localStorage.getItem(MFA_SNOOZE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function MfaReminder() {
  const { mfaEnabled, loading } = useAuth();
  const [snoozedUntil, setSnoozedUntil] = useState(readSnooze);

  if (loading || mfaEnabled || snoozedUntil > Date.now()) return null;

  const snooze = () => {
    const until = Date.now() + MFA_SNOOZE_DAYS * 86_400_000;
    try {
      localStorage.setItem(MFA_SNOOZE_KEY, String(until));
    } catch {
      // Storage unavailable: hide for this session only.
    }
    setSnoozedUntil(until);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
        <span>Two-factor sign-in is off. Turn it on to keep your account secure.</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" onClick={snooze}>
          Remind me in {MFA_SNOOZE_DAYS} days
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/profile">Set up 2FA</Link>
        </Button>
      </div>
    </div>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <ShellContext.Provider value={true}>
      <NavCountsProvider>
        <SidebarProvider>
          <div className="flex min-h-svh w-full max-w-full overflow-x-hidden">
            <AppSidebar />
            <SidebarInset className="min-w-0 max-w-full overflow-x-hidden">
              <AppHeader />
              <BroadcastBanner />
              <SystemNoticesBanner />
              <MfaReminder />
              <main className="flex-1 min-w-0 max-w-full overflow-x-hidden p-3 sm:p-6">{children}</main>
              <footer className="border-t px-3 pb-24 pt-3 text-center text-xs text-muted-foreground sm:px-6 md:pb-3">
                Shoplane is powered by Blumint Workspace · © {new Date().getFullYear()} Blumint Digital Limited · Registered in England and Wales · Company No. 15709531
              </footer>
            </SidebarInset>
          </div>
          <MobileTabBar />
        </SidebarProvider>
      </NavCountsProvider>
    </ShellContext.Provider>
  );
}

/**
 * Layout route element: mounts the sidebar, header and banners once for all
 * signed-in pages, so navigating between them no longer remounts the sidebar
 * (and its settings query + realtime subscription).
 */
export function AppShell() {
  const { user, role, needsMfaVerification } = useAuth();
  if (!user || !role || needsMfaVerification) return <Outlet />;
  return (
    <ShellFrame>
      {/* Lazy pages suspend here, inside the content area, so the sidebar and header stay mounted. */}
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </ShellFrame>
  );
}

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Pages wrap themselves in DashboardLayout. Inside the AppShell route it is a
 * pass-through; rendered on its own (outside that route) it provides the shell.
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const insideShell = useContext(ShellContext);
  if (insideShell) return <>{children}</>;
  return <ShellFrame>{children}</ShellFrame>;
}
