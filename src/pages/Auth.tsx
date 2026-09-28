import { useState, useEffect, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import type { AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ShieldCheck, KeyRound, Briefcase, Building2, Eye, EyeOff, Loader2, ArrowLeft, MailCheck,
  AlertTriangle,
} from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useCountdown } from "@/hooks/useCountdown";
import { resolveLogoUrl, useDefaultLogoOnError } from "@/lib/branding";
import { trustThisDevice } from "@/lib/deviceTrust";
import { cn } from "@/lib/utils";

const MIN_PASSWORD = 8;

/** 0–4: length, mixed case, digits, symbols. */
function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = pw.length >= MIN_PASSWORD ? 1 : 0;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}
const SCORE_LABEL = ["Too short", "Weak", "Fair", "Good", "Strong"];
const SCORE_COLOR = ["bg-destructive", "bg-destructive", "bg-warning", "bg-success", "bg-success"];

function PasswordInput({
  id, value, onChange, autoComplete, placeholder, minLength,
}: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string; minLength?: number }) {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyUp={checkCaps}
          onKeyDown={checkCaps}
          onBlur={() => setCapsLock(false)}
          required
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="h-11 pr-11"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow((v) => !v)}
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {capsLock && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" /> Caps Lock is on
        </p>
      )}
    </div>
  );
}

function Field({ label, htmlFor, aside, hint, children }: { label: string; htmlFor: string; aside?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[13px] font-medium">{label}</Label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SubmitButton({ busy, busyLabel, children, disabled }: { busy: boolean; busyLabel: string; children: ReactNode; disabled?: boolean }) {
  return (
    <Button type="submit" className="h-11 w-full text-[15px]" disabled={busy || disabled}>
      {busy ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{busyLabel}</>) : children}
    </Button>
  );
}

export default function Auth() {
  const {
    signIn,
    signUp,
    signOut,
    user,
    role,
    loading,
    mfaCheckPending,
    needsMfaVerification,
    pendingMfaFactorId,
    pendingMfaRole,
    clearMfaFlag,
  } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupInviteCode, setSignupInviteCode] = useState("");
  const [signupRole, setSignupRole] = useState<"staff" | "client">("client");
  const [signupCompanyName, setSignupCompanyName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginImageUrl, setLoginImageUrl] = useState<string | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);
  const [workshopName, setWorkshopName] = useState<string>("Workshop Manager");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  // MFA state
  const [localMfaStep, setLocalMfaStep] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupRemainingAttempts, setBackupRemainingAttempts] = useState<number | null>(null);
  const [backupLockoutSec, setBackupLockoutSec] = useState<number | null>(null);
  const lockout = useCountdown(backupLockoutSec);
  const isLocked = lockout.remaining > 0;
  const mfaStep = localMfaStep || needsMfaVerification;
  const activeMfaFactorId = mfaFactorId ?? pendingMfaFactorId;
  const activePendingRole = pendingRole ?? pendingMfaRole ?? role;
  // XXXX-XXXX format; A–Z and 2–9 only (matches the generator alphabet).
  const BACKUP_REGEX = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
  const backupFormatValid = BACKUP_REGEX.test(backupCode);
  const backupFormatHint =
    backupCode.length > 0 && !backupFormatValid
      ? "Use the format XXXX-XXXX (letters A–Z and digits 2–9)."
      : null;
  const score = passwordScore(signupPassword);
  const confirmMismatch = signupConfirmPassword.length > 0 && signupConfirmPassword !== signupPassword;

  const formatBackupInput = (raw: string) => {
    const cleaned = raw.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8);
    return cleaned.length > 4 ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}` : cleaned;
  };

  const getErrorMessage = (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback;

  type BackupVerifyPayload = {
    success?: boolean;
    remaining_attempts?: number;
    retry_after_sec?: number;
    error?: string;
  };

  const parseBackupVerifyPayload = (payload: unknown): BackupVerifyPayload => {
    if (typeof payload === "string") {
      try {
        return parseBackupVerifyPayload(JSON.parse(payload));
      } catch {
        return { error: payload };
      }
    }
    if (!payload || typeof payload !== "object") return {};

    const record = payload as Record<string, unknown>;
    return {
      success: typeof record.success === "boolean" ? record.success : undefined,
      remaining_attempts: typeof record.remaining_attempts === "number" ? record.remaining_attempts : undefined,
      retry_after_sec: typeof record.retry_after_sec === "number" ? record.retry_after_sec : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
    };
  };

  useEffect(() => {
    // Don't route to the dashboard while the MFA requirement is still being
    // evaluated — role state lands before needsMfaVerification does.
    if (!loading && !mfaCheckPending && user && role && !needsMfaVerification && !mfaStep) {
      navigate(getRoleDashboardPath(role), { replace: true });
    }
  }, [user, role, loading, mfaCheckPending, navigate, needsMfaVerification, mfaStep]);

  useEffect(() => {
    const loadBranding = async () => {
      const { data, error } = await supabase
        .from("workshop_settings_public")
        .select("login_image_url, workshop_name, logo_url")
        .eq("id", 1)
        .maybeSingle();

      if (error || !data) return;
      if (data.login_image_url) setLoginImageUrl(data.login_image_url);
      if (data.workshop_name) setWorkshopName(data.workshop_name);
      if (data.logo_url) setLogoUrl(data.logo_url);
    };

    void loadBranding();
  }, []);

  if (loading) return <LoadingScreen />;
  // Avoid flashing the auth form while post-signin state is still propagating
  // (role loads before the MFA requirement is known).
  if (user && !mfaStep && (!role || mfaCheckPending)) return <LoadingScreen />;
  if (needsMfaVerification && !activeMfaFactorId) return <LoadingScreen />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setLoginError(null);
    try {
      const result = await signIn(loginEmail.trim(), loginPassword);
      if (result.needsMfa) {
        setLocalMfaStep(true);
        setMfaFactorId(result.factorId ?? null);
        setPendingRole(result.role);
      } else if (result.role) {
        toast.success("Signed in successfully");
        navigate(getRoleDashboardPath(result.role), { replace: true });
      } else {
        toast.error("Your account hasn't been set up yet. Please contact your administrator to get access.");
        await signOut();
      }
    } catch (err: unknown) {
      setLoginError(getErrorMessage(err, "Failed to sign in"));
    } finally {
      setSubmitting(false);
    }
  };

  const trustThisDeviceIfRequested = async () => {
    if (!rememberDevice) return;
    const { data: { session } } = await supabase.auth.getSession();
    const ok = session ? await trustThisDevice(session.access_token, session.user.id) : false;
    if (!ok) toast.error("Couldn't trust this browser, but you are signed in.");
  };

  const resetMfa = () => {
    clearMfaFlag();
    setLocalMfaStep(false);
    setMfaFactorId(null);
    setPendingRole(null);
    setMfaCode("");
    setMfaError(null);
    setBackupCode("");
    setBackupError(null);
    setUseBackupCode(false);
  };

  const finishMfaSuccess = async () => {
    await trustThisDeviceIfRequested();
    const next = activePendingRole;
    resetMfa();
    toast.success("Signed in successfully");
    navigate(getRoleDashboardPath(next), { replace: true });
  };

  const handleMfaVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeMfaFactorId || mfaCode.length !== 6 || mfaSubmitting) return;
    setMfaSubmitting(true);
    setMfaError(null);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: activeMfaFactorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: activeMfaFactorId,
        challengeId: challengeData.id,
        code: mfaCode,
      });
      if (verifyError) throw verifyError;

      await finishMfaSuccess();
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Invalid verification code");
      setMfaError(message);
      toast.error(message);
      setMfaCode("");
    } finally {
      setMfaSubmitting(false);
    }
  };

  const handleBackupCodeVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupFormatValid || isLocked) return;
    setBackupError(null);
    setMfaSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("mfa-backup-verify", {
        body: { code: backupCode.trim() },
      });
      // supabase-js surfaces non-2xx as FunctionsHttpError; pull data from context if present.
      const errorBody =
        error && typeof error === "object" && "context" in error
          ? (error as { context?: { body?: unknown } }).context?.body
          : undefined;
      const parsed = parseBackupVerifyPayload(data ?? errorBody);

      if (parsed?.success) {
        await finishMfaSuccess();
        return;
      }

      // Error path
      if (typeof parsed?.remaining_attempts === "number") {
        setBackupRemainingAttempts(parsed.remaining_attempts);
      }
      if (typeof parsed?.retry_after_sec === "number" && parsed.retry_after_sec > 0) {
        setBackupLockoutSec(parsed.retry_after_sec);
        setBackupError(parsed.error || "Too many attempts. Please wait.");
      } else {
        const remainingMsg =
          typeof parsed?.remaining_attempts === "number"
            ? ` ${parsed.remaining_attempts} attempt${parsed.remaining_attempts === 1 ? "" : "s"} remaining.`
            : "";
        setBackupError((parsed?.error || error?.message || "Invalid backup code") + remainingMsg);
      }
      setBackupCode("");
    } catch (err: unknown) {
      setBackupError(getErrorMessage(err, "Invalid backup code"));
      setBackupCode("");
    } finally {
      setMfaSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword.length < MIN_PASSWORD) {
      toast.error(`Use at least ${MIN_PASSWORD} characters for your password`);
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!signupFirstName.trim() || !signupLastName.trim()) {
      toast.error("First and last name are required");
      return;
    }
    if (signupRole === "client" && !signupCompanyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (!signupInviteCode.trim()) {
      toast.error("An invite code is required to create an account");
      return;
    }
    setSubmitting(true);
    try {
      const { data: redeemRes, error: redeemError } = await supabase.functions.invoke(
        "validate-signup-code",
        { body: { code: signupInviteCode.trim() } },
      );
      if (redeemError) throw redeemError;
      if (!redeemRes?.valid) {
        toast.error(redeemRes?.error || "Invalid, expired, or fully-used invite code");
        setSubmitting(false);
        return;
      }
      // If the code is tied to a specific role, ensure the user's selection matches.
      if (redeemRes.role && redeemRes.role !== signupRole) {
        toast.error(
          `This code is for ${redeemRes.role} accounts. Please use the correct code or switch your role selection.`
        );
        setSubmitting(false);
        return;
      }
      const fullName = `${signupFirstName.trim()} ${signupLastName.trim()}`;
      await signUp(signupEmail.trim(), signupPassword, fullName, signupInviteCode.trim(), signupRole, signupCompanyName.trim() || undefined);
      setConfirmationEmail(signupEmail.trim());
      setEmailConfirmationSent(true);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to create account"));
    } finally {
      setSubmitting(false);
    }
  };

  const logo = (size: string) => (
    <img src={resolveLogoUrl(logoUrl)} alt="" className={cn(size, "rounded-xl object-contain")} onError={useDefaultLogoOnError} />
  );

  const legal = (
    <footer className="space-y-1.5 text-center text-xs leading-relaxed text-muted-foreground">
      <p>
        <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
        <span className="mx-2" aria-hidden>·</span>
        <Link to="/terms" className="hover:text-foreground hover:underline">Terms</Link>
      </p>
      <p>Shoplane · © {new Date().getFullYear()} Blumint Digital Limited · Registered in England and Wales · Company No. 15709531</p>
    </footer>
  );

  // Single-column screens (2FA, email sent): a focused panel with the brand above it.
  // Called as a function, not rendered as a component, so its inputs keep focus.
  const focused = ({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: ReactNode; children: ReactNode }) => (
    <div className="flex min-h-screen flex-col bg-background px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center gap-8">
        <div className="flex items-center justify-center gap-2.5">
          {logo("h-8 w-8")}
          <span className="text-sm font-semibold tracking-tight">{workshopName}</span>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-elevation sm:p-8">
          <div className="mb-6 space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">{icon}</div>
            <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          </div>
          {children}
        </div>
        {legal}
      </div>
    </div>
  );

  // Email confirmation screen
  if (emailConfirmationSent) {
    return focused({
      icon: <MailCheck className="h-6 w-6" />,
      title: "Check your email",
      subtitle: <>We sent a confirmation link to <span className="font-medium text-foreground">{confirmationEmail}</span>.</>,
      children: (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted-foreground">
            Open the link to verify your account, then sign in. It can take a minute to arrive; check spam if it doesn't.
          </p>
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={async () => {
              const { error } = await supabase.auth.resend({ type: "signup", email: confirmationEmail });
              if (error) toast.error("Failed to resend email");
              else toast.success("Confirmation email resent");
            }}
          >
            Resend email
          </Button>
          <Button
            variant="ghost"
            className="h-11 w-full"
            onClick={() => {
              setEmailConfirmationSent(false);
              setConfirmationEmail("");
              setMode("signin");
            }}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to sign in
          </Button>
        </div>
      ),
    });
  }

  const trustToggle = (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/40 p-3 text-left">
      <Checkbox className="mt-0.5" checked={rememberDevice} onCheckedChange={(v) => setRememberDevice(!!v)} aria-describedby="trust-hint" />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">Trust this browser for 30 days</span>
        <span id="trust-hint" className="block text-xs text-muted-foreground">
          Skip the code here next time. Don't tick this on a shared computer. You can revoke it in Profile → Security.
        </span>
      </span>
    </label>
  );

  // MFA verification screen
  if (mfaStep) {
    return focused({
      icon: useBackupCode ? <KeyRound className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />,
      title: useBackupCode ? "Use a backup code" : "Two-Factor Authentication",
      subtitle: useBackupCode
        ? "Enter one of the backup codes you saved when you set up 2FA."
        : "Enter the 6-digit code from your authenticator app.",
      children: useBackupCode ? (
          <form onSubmit={handleBackupCodeVerify} className="space-y-5">
            <Field label="Backup code" htmlFor="backup-code">
              <Input
                id="backup-code"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(formatBackupInput(e.target.value));
                  setBackupError(null);
                }}
                placeholder="XXXX-XXXX"
                autoComplete="one-time-code"
                maxLength={9}
                disabled={isLocked}
                aria-invalid={!!backupFormatHint || !!backupError}
                className={cn(
                  "h-12 text-center font-mono text-lg tracking-[0.2em]",
                  (backupFormatHint || backupError) && "border-destructive focus-visible:ring-destructive",
                )}
                autoFocus
              />
              {backupFormatHint && <p className="text-xs text-destructive">{backupFormatHint}</p>}
              {backupError && !backupFormatHint && <p role="alert" className="text-xs text-destructive">{backupError}</p>}
              {isLocked && <p className="text-xs text-destructive">Locked out. Try again in {lockout.formatted}.</p>}
              {!isLocked && backupRemainingAttempts !== null && backupRemainingAttempts > 0 && !backupError && (
                <p className="text-xs text-muted-foreground">
                  {backupRemainingAttempts} attempt{backupRemainingAttempts === 1 ? "" : "s"} remaining before lockout.
                </p>
              )}
            </Field>
            {trustToggle}
            <SubmitButton busy={mfaSubmitting} busyLabel="Verifying…" disabled={!backupFormatValid || isLocked}>
              Verify backup code
            </SubmitButton>
            <Button type="button" variant="ghost" className="h-10 w-full" onClick={() => { setUseBackupCode(false); setBackupCode(""); }}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Use authenticator code
            </Button>
          </form>
        ) : (
          <form onSubmit={handleMfaVerify} className="space-y-5">
            <div className="flex flex-col items-center gap-2">
              <InputOTP
                maxLength={6}
                value={mfaCode}
                onChange={(v) => { setMfaCode(v); setMfaError(null); }}
                autoFocus
                aria-invalid={!!mfaError}
              >
                <InputOTPGroup className="gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} className="h-12 w-11 rounded-md border text-lg font-semibold first:rounded-md last:rounded-md" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              {mfaError && <p role="alert" className="text-xs text-destructive">{mfaError}</p>}
            </div>
            {trustToggle}
            <SubmitButton busy={mfaSubmitting} busyLabel="Verifying…" disabled={!activeMfaFactorId || mfaCode.length !== 6}>
              Verify
            </SubmitButton>
            <div className="flex items-center justify-between gap-2 text-sm">
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setUseBackupCode(true)}>
                Use a backup code
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => { resetMfa(); void signOut(); }}
              >
                Sign in as someone else
              </button>
            </div>
          </form>
        ),
    });
  }

  const heroSrc = loginImageUrl ?? "/auth-hero.jpg";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <aside className="relative hidden w-[44%] max-w-[720px] overflow-hidden bg-[hsl(150_30%_12%)] text-white lg:flex lg:flex-col">
        {!heroFailed && (
          <img
            src={heroSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setHeroFailed(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(150_30%_8%/0.55)] via-[hsl(150_30%_8%/0.35)] to-[hsl(150_30%_6%/0.92)]" />
        <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/95 p-1.5 shadow-sm">{logo("h-9 w-9")}</div>
            <span className="text-base font-semibold tracking-tight">{workshopName}</span>
          </div>
          <div className="max-w-md">
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance xl:text-4xl">
                Every project, from reception to delivery.
              </h2>
              <p className="text-[15px] leading-relaxed text-white/75">
                Quotes, the workshop floor, quality checks, invoicing and handover in one place, for your team and your clients.
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Form */}
      <main className="flex flex-1 flex-col px-4 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center gap-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            {logo("h-9 w-9")}
            <span className="text-base font-semibold tracking-tight">{workshopName}</span>
          </div>

          {mode === "signin" ? (
            <section className="space-y-7">
              <header className="space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="text-sm text-muted-foreground">Welcome back. Use the email your workshop invited you with.</p>
              </header>
              <form onSubmit={handleLogin} className="space-y-5">
                <Field label="Email" htmlFor="login-email">
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => { setLoginEmail(e.target.value); setLoginError(null); }}
                    required
                    autoFocus
                    autoComplete="username"
                    inputMode="email"
                    placeholder="name@company.com"
                    className="h-11"
                  />
                </Field>
                <Field
                  label="Password"
                  htmlFor="login-password"
                  aside={<Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">Forgot password?</Link>}
                >
                  <PasswordInput id="login-password" value={loginPassword} onChange={(v) => { setLoginPassword(v); setLoginError(null); }} autoComplete="current-password" />
                </Field>
                {loginError && (
                  <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive">
                    {loginError}
                  </p>
                )}
                <SubmitButton busy={submitting} busyLabel="Signing in…">Sign In</SubmitButton>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                Have an invite code?{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </p>
            </section>
          ) : (
            <section className="space-y-7">
              <header className="space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
                <p className="text-sm text-muted-foreground">You'll need the invite code your workshop sent you.</p>
              </header>
              <form onSubmit={handleSignup} className="space-y-5">
                <fieldset className="space-y-1.5">
                  <legend className="mb-1.5 text-[13px] font-medium">Account type</legend>
                  <div role="radiogroup" className="grid grid-cols-2 gap-2">
                    {([
                      { value: "client", icon: Building2, title: "Client", sub: "We bring work to the workshop" },
                      { value: "staff", icon: Briefcase, title: "Staff", sub: "I work at the workshop" },
                    ] as const).map((opt) => {
                      const active = signupRole === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => { setSignupRole(opt.value); setSignupCompanyName(""); }}
                          className={cn(
                            "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "border-primary bg-primary-soft" : "hover:border-muted-foreground/40",
                          )}
                        >
                          <opt.icon className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                          <span>
                            <span className="block text-sm font-medium">{opt.title}</span>
                            <span className="block text-xs leading-snug text-muted-foreground">{opt.sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <Field label="Invite code" htmlFor="signup-invite-code" hint="Your workshop admin can issue one from Settings.">
                  <Input
                    id="signup-invite-code"
                    value={signupInviteCode}
                    onChange={(e) => setSignupInviteCode(e.target.value)}
                    required
                    placeholder="Paste your code"
                    autoComplete="off"
                    maxLength={64}
                    className="h-11 font-mono"
                  />
                </Field>

                {signupRole === "client" && (
                  <Field label="Company name" htmlFor="signup-company-name">
                    <Input id="signup-company-name" value={signupCompanyName} onChange={(e) => setSignupCompanyName(e.target.value)} required autoComplete="organization" placeholder="Acme Fabrication Ltd" className="h-11" />
                  </Field>
                )}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-3">
                  <Field label={signupRole === "client" ? "Contact first name" : "First name"} htmlFor="signup-first-name">
                    <Input id="signup-first-name" value={signupFirstName} onChange={(e) => setSignupFirstName(e.target.value)} required autoComplete="given-name" className="h-11" />
                  </Field>
                  <Field label={signupRole === "client" ? "Contact last name" : "Last name"} htmlFor="signup-last-name">
                    <Input id="signup-last-name" value={signupLastName} onChange={(e) => setSignupLastName(e.target.value)} required autoComplete="family-name" className="h-11" />
                  </Field>
                </div>

                <Field label="Work email" htmlFor="signup-email">
                  <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required autoComplete="email" inputMode="email" placeholder="name@company.com" className="h-11" />
                </Field>

                <Field label="Password" htmlFor="signup-password">
                  <PasswordInput id="signup-password" value={signupPassword} onChange={setSignupPassword} autoComplete="new-password" minLength={MIN_PASSWORD} />
                  <div className="flex items-center gap-3 pt-0.5" aria-live="polite">
                    <div className="grid flex-1 grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <span key={i} className={cn("h-1 rounded-full", signupPassword && score >= i ? SCORE_COLOR[score] : "bg-muted")} />
                      ))}
                    </div>
                    <span className="w-16 text-right text-xs text-muted-foreground">
                      {signupPassword ? SCORE_LABEL[score] : `${MIN_PASSWORD}+ chars`}
                    </span>
                  </div>
                </Field>

                <Field label="Confirm password" htmlFor="signup-confirm-password">
                  <PasswordInput id="signup-confirm-password" value={signupConfirmPassword} onChange={setSignupConfirmPassword} autoComplete="new-password" minLength={MIN_PASSWORD} />
                  {confirmMismatch && <p className="text-xs text-destructive">Passwords don't match yet.</p>}
                </Field>

                <SubmitButton busy={submitting} busyLabel="Creating account…">Create account</SubmitButton>
                <p className="text-center text-xs text-muted-foreground">
                  By creating an account you agree to the <Link to="/terms" className="underline hover:text-foreground">Terms</Link> and{" "}
                  <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
                </p>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </p>
            </section>
          )}
        </div>
        <div className="mx-auto mt-10 w-full max-w-[400px]">{legal}</div>
      </main>
    </div>
  );
}
