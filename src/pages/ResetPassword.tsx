import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Eye, EyeOff, Check, X, CheckCircle2, ArrowRight } from "lucide-react";
import { resolveLogoUrl, useDefaultLogoOnError } from "@/lib/branding";
import { getRoleDashboardPath, AppRole } from "@/hooks/useAuth";

type Strength = { score: number; label: string; color: string };

function evaluateStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map: Strength[] = [
    { score: 0, label: "Too weak", color: "bg-destructive" },
    { score: 1, label: "Weak", color: "bg-destructive" },
    { score: 2, label: "Fair", color: "bg-orange-500" },
    { score: 3, label: "Good", color: "bg-yellow-500" },
    { score: 4, label: "Strong", color: "bg-green-500" },
    { score: 5, label: "Excellent", color: "bg-green-600" },
  ];
  return map[score];
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resolvedRole, setResolvedRole] = useState<AppRole | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [workshopName, setWorkshopName] = useState("Workshop Manager");
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    supabase
      .from("workshop_settings_public")
      .select("logo_url, workshop_name")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.logo_url) setLogoUrl(data.logo_url as string);
        if (data?.workshop_name) setWorkshopName(data.workshop_name as string);
      });
  }, []);

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get("type");
    if (type === "recovery" || type === "invite" || type === "signup") {
      if (type === "invite" || type === "signup") setIsInvite(true);
      setReady(true);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const strength = useMemo(() => evaluateStrength(password), [password]);
  const checks = useMemo(() => ({
    length: password.length >= 8,
    case: /[A-Z]/.test(password) && /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
    match: password.length > 0 && password === confirm,
  }), [password, confirm]);

  const confirmError = confirm.length > 0 && password !== confirm;
  const canSubmit = ready && !submitting && checks.length && checks.match && strength.score >= 2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Resolve the user's role for redirect
      const { data: { user } } = await supabase.auth.getUser();
      let role: AppRole | null = null;
      if (user) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        role = (roleRow?.role as AppRole | undefined) ?? null;
      }
      setResolvedRole(role);
      setSuccess(true);
      toast.success("Password updated successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setSubmitting(false);
    }
  };

  const dashboardPath = getRoleDashboardPath(resolvedRole);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src={resolveLogoUrl(logoUrl)} alt={workshopName} className="h-40 w-40 rounded-2xl object-contain drop-shadow-md" onError={useDefaultLogoOnError} />
          <h1 className="text-2xl font-bold tracking-tight">{workshopName}</h1>
        </div>

        <Card>
          {success ? (
            <>
              <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>You're all set!</CardTitle>
                <CardDescription>
                  {isInvite ? "Your account is now active." : "Your password has been updated."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {resolvedRole ? (
                  <Button asChild className="w-full">
                    <Link to={dashboardPath}>
                      Go to {resolvedRole} dashboard <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button asChild className="w-full">
                    <Link to="/auth">Continue to sign in</Link>
                  </Button>
                )}
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{isInvite ? "Set Your Password" : "Reset Password"}</CardTitle>
                <CardDescription>
                  {isInvite
                    ? "Welcome! Create a password to activate your account."
                    : "Enter your new password"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!ready ? (
                  <p className="text-center text-sm text-muted-foreground py-4">Verifying reset link...</p>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <div className="relative">
                        <Input id="new-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="••••••••" autoComplete="new-password" className="pr-10" />
                        <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {password.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Strength</span>
                            <span className="font-medium">{strength.label}</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className={`h-full transition-all ${strength.color}`} style={{ width: `${(strength.score / 5) * 100}%` }} />
                          </div>
                          <ul className="grid grid-cols-2 gap-1 pt-1 text-xs text-muted-foreground">
                            <Requirement met={checks.length} label="8+ characters" />
                            <Requirement met={checks.case} label="Upper & lower" />
                            <Requirement met={checks.number} label="A number" />
                            <Requirement met={checks.symbol} label="A symbol" />
                          </ul>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Input id="confirm-password" type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} placeholder="••••••••" autoComplete="new-password" className={`pr-10 ${confirmError ? "border-destructive focus-visible:ring-destructive" : ""}`} aria-invalid={confirmError} />
                        <button type="button" tabIndex={-1} onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showConfirm ? "Hide password" : "Show password"}>
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {confirmError && <p className="text-xs text-destructive">Passwords do not match</p>}
                      {checks.match && <p className="text-xs text-green-600 dark:text-green-400 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Passwords match</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={!canSubmit}>
                      {submitting ? "Updating..." : isInvite ? "Activate Account" : "Update Password"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </>
          )}
        </Card>
        <p className="text-center text-xs text-muted-foreground">Shoplane is powered by Blumint Workspace · © {new Date().getFullYear()} Blumint Digital Limited · Registered in England and Wales · Company No. 15709531</p>
      </div>
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={`inline-flex items-center gap-1 ${met ? "text-green-600 dark:text-green-400" : ""}`}>
      {met ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </li>
  );
}
