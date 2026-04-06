import { useState } from "react";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Briefcase, Wrench, User } from "lucide-react";

const DEMO_PASSWORD = "Demo1234!";

export const ROLES = [
  {
    role: "admin",
    email: "demo.admin@workshop.demo",
    label: "Admin",
    icon: ShieldCheck,
    color: "bg-violet-500/10 text-violet-600 border-violet-200",
    description: "Full access to all features — users, settings, reports, invoices, and more.",
    capabilities: ["Manage all users & roles", "View reports & analytics", "Delete invoices", "Configure settings", "Access activity logs"],
  },
  {
    role: "manager",
    email: "demo.manager@workshop.demo",
    label: "Manager",
    icon: Briefcase,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
    description: "Operational access — manage jobs, appointments, inventory, and invoices.",
    capabilities: ["Create & manage jobs", "Schedule appointments", "Manage inventory", "Create & send invoices", "View staff"],
  },
  {
    role: "staff",
    email: "demo.staff@workshop.demo",
    label: "Staff",
    icon: Wrench,
    color: "bg-amber-500/10 text-amber-600 border-amber-200",
    description: "View and update assigned jobs. See the schedule and inventory levels.",
    capabilities: ["View assigned jobs", "Update job status (kanban)", "View schedule", "Check inventory"],
  },
  {
    role: "client",
    email: "demo.client@workshop.demo",
    label: "Client",
    icon: User,
    color: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
    description: "Client portal — track job progress, view appointments, and pay invoices.",
    capabilities: ["Track job progress", "View appointments", "View & download invoices", "Manage profile"],
  },
];

export default function Demo() {
  const { signIn } = useAuth();
  const [loadingRole, setLoadingRole] = useState<string | null>(null);

  const loginAs = async (email: string) => {
    setLoadingRole(email);
    try {
      const result = await signIn(email, DEMO_PASSWORD);
      window.location.href = getRoleDashboardPath(result.role);
    } catch (err: any) {
      toast.error(
        err?.message?.includes("Invalid login")
          ? "Demo users not set up yet. Ask an admin to run Setup Demo Users in Settings → Data."
          : err?.message || "Failed to sign in"
      );
      setLoadingRole(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-5xl space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Workshop Buddy Demo</h1>
          <p className="text-muted-foreground text-lg">
            Choose a role to explore the app. Each role has a different level of access.
          </p>
          <p className="text-sm text-muted-foreground">
            Password for all accounts: <span className="font-mono font-medium text-foreground">{DEMO_PASSWORD}</span>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ROLES.map(({ role, email, label, icon: Icon, color, description, capabilities }) => (
            <Card key={role} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center mb-3 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-lg">{label}</CardTitle>
                <CardDescription className="text-sm">{description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <ul className="space-y-1 flex-1">
                  {capabilities.map((c) => (
                    <li key={c} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="mt-0.5 shrink-0 text-foreground/40">•</span>
                      {c}
                    </li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-mono truncate" title={email}>{email}</p>
                  <Button
                    className="w-full"
                    onClick={() => loginAs(email)}
                    disabled={loadingRole !== null}
                  >
                    {loadingRole === email
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
                      : `Login as ${label}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Demo accounts must be set up by an admin via Settings → Data → Setup Demo Users.
        </p>
      </div>
    </div>
  );
}
