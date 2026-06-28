import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import type { AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck, KeyRound, Briefcase, User, Eye, EyeOff } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useCountdown } from "@/hooks/useCountdown";
import { resolveLogoUrl, useDefaultLogoOnError } from "@/lib/branding";

export default function Auth() {
  const {
    signIn,
    signUp,
    signOut,
    user,
    role,
    loading,
    needsMfaVerification,
    pendingMfaFactorId,
    pendingMfaRole,
    clearMfaFlag,
  } = useAuth();
  const navigate = useNavigate();
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
  const [loginImageUrl, setLoginImageUrl] = useState<string | null>(null);
  const [workshopName, setWorkshopName] = useState<string>("Workshop Manager");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  // MFA state
  const [localMfaStep, setLocalMfaStep] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupRemainingAttempts, setBackupRemainingAttempts] = useState<number | null>(null);
  const [backupLockoutSec, setBackupLockoutSec] = useState<number | null>(null);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
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
    if (!loading && user && role && !needsMfaVerification && !mfaStep) {
      navigate(getRoleDashboardPath(role), { replace: true });
    }
  }, [user, role, loading, navigate, needsMfaVerification, mfaStep]);

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
  // Avoid flashing the auth form while post-signin state is still propagating.
  if (user && !mfaStep && !role) return <LoadingScreen />;
  if (needsMfaVerification && !activeMfaFactorId) return <LoadingScreen />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await signIn(loginEmail, loginPassword);
      if (result.needsMfa) {
        setLocalMfaStep(true);
        setMfaFactorId(result.factorId);
        setPendingRole(result.role);
        toast.info("Please enter your 2FA code");
      } else if (result.role) {
        toast.success("Signed in successfully");
        navigate(getRoleDashboardPath(result.role), { replace: true });
      } else {
        toast.error("Your account hasn't been set up yet. Please contact your administrator to get access.");
        await signOut();
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to sign in"));
    } finally {
      setSubmitting(false);
    }
  };

  const checkTrustedDevice = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mfa-check-device`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );
    if (!res.ok) return false;
    const data: unknown = await res.json().catch(() => null);
    const trusted = data && typeof data === "object" && (data as Record<string, unknown>).trusted;
    return trusted === true;
  };

  const trustThisDeviceIfRequested = async () => {
    if (!rememberDevice) return;
    try {
      const label = navigator.userAgent.slice(0, 180);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Missing session");
      // Token is set as an httpOnly cookie by the edge function — no localStorage needed
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mfa-trust-device`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ device_label: label }),
        }
      );
      const data: unknown = await res.json().catch(() => null);
      const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
      if (!res.ok || record.ok !== true) {
        throw new Error(typeof record.error === "string" ? record.error : "Trust-device request failed");
      }
      const trusted = await checkTrustedDevice();
      if (!trusted) {
        throw new Error("Trust-device cookie was not accepted");
      }
    } catch {
      toast.error("Could not remember this device, but you are signed in.");
    }
  };

  const finishMfaSuccess = async () => {
    await trustThisDeviceIfRequested();
    clearMfaFlag();
    setLocalMfaStep(false);
    setMfaFactorId(null);
    setPendingRole(null);
    setMfaCode("");
    setBackupCode("");
    setUseBackupCode(false);
    toast.success("Signed in successfully");
    navigate(getRoleDashboardPath(activePendingRole), { replace: true });
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMfaFactorId || mfaCode.length !== 6) return;
    setMfaSubmitting(true);
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
      toast.error(getErrorMessage(err, "Invalid verification code"));
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
      await signUp(signupEmail, signupPassword, fullName, signupRole, signupCompanyName.trim() || undefined);
      setConfirmationEmail(signupEmail);
      setEmailConfirmationSent(true);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Failed to create account"));
    } finally {
      setSubmitting(false);
    }
  };

  // Email confirmation screen
  if (emailConfirmationSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-2">
            <img src={resolveLogoUrl(logoUrl)} alt={workshopName} className="h-16 w-16 rounded-lg object-contain" onError={useDefaultLogoOnError} />
            <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
            <p className="text-sm text-muted-foreground text-center">
              We've sent a confirmation link to
            </p>
            <p className="text-sm font-medium">{confirmationEmail}</p>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Click the link in the email to verify your account and sign in. If you don't see it, check your spam folder.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await supabase.auth.resend({ type: "signup", email: confirmationEmail });
                      toast.success("Confirmation email resent!");
                    } catch {
                      toast.error("Failed to resend email");
                    }
                  }}
                >
                  Resend confirmation email
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setEmailConfirmationSent(false);
                    setConfirmationEmail("");
                  }}
                >
                  Back to sign in
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // MFA verification screen
  if (mfaStep) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              {useBackupCode ? <KeyRound className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {useBackupCode ? "Use a backup code" : "Two-Factor Authentication"}
            </h1>
            <p className="text-sm text-muted-foreground text-center">
              {useBackupCode
                ? "Enter one of the backup codes you saved when setting up 2FA"
                : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>
          <Card>
            <CardContent className="pt-6">
              {useBackupCode ? (
                <form onSubmit={handleBackupCodeVerify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="backup-code">Backup code</Label>
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
                      className={`font-mono tracking-wider text-center ${
                        (backupFormatHint || backupError) ? "border-destructive focus-visible:ring-destructive" : ""
                      }`}
                      autoFocus
                    />
                    {backupFormatHint && (
                      <p className="text-xs text-destructive">{backupFormatHint}</p>
                    )}
                    {backupError && !backupFormatHint && (
                      <p className="text-xs text-destructive">{backupError}</p>
                    )}
                    {isLocked && (
                      <p className="text-xs text-destructive">
                        Locked out. Try again in {lockout.formatted}.
                      </p>
                    )}
                    {!isLocked && backupRemainingAttempts !== null && backupRemainingAttempts > 0 && !backupError && (
                      <p className="text-xs text-muted-foreground">
                        {backupRemainingAttempts} attempt{backupRemainingAttempts === 1 ? "" : "s"} remaining before lockout.
                      </p>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={rememberDevice} onCheckedChange={(v) => setRememberDevice(!!v)} />
                    Remember this device for 30 days
                  </label>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={mfaSubmitting || !backupFormatValid || isLocked}
                  >
                    {mfaSubmitting ? "Verifying..." : "Verify backup code"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => { setUseBackupCode(false); setBackupCode(""); }}
                  >
                    Back to authenticator code
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleMfaVerify} className="space-y-6">
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={mfaCode} onChange={setMfaCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <label className="flex items-center justify-center gap-2 text-sm">
                    <Checkbox checked={rememberDevice} onCheckedChange={(v) => setRememberDevice(!!v)} />
                    Remember this device for 30 days
                  </label>
                  <Button type="submit" className="w-full" disabled={mfaSubmitting || !activeMfaFactorId || mfaCode.length !== 6}>
                    {mfaSubmitting ? "Verifying..." : "Verify"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setUseBackupCode(true)}
                  >
                    <KeyRound className="h-4 w-4 mr-1" />
                    Use a backup code instead
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setLocalMfaStep(false);
                      setMfaFactorId(null);
                      setPendingRole(null);
                      setMfaCode("");
                      clearMfaFlag();
                      supabase.auth.signOut();
                    }}
                  >
                    Cancel
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-2">
            <img src={resolveLogoUrl(logoUrl)} alt={workshopName} className="h-40 w-40 rounded-2xl object-contain drop-shadow-md" onError={useDefaultLogoOnError} />
            <h1 className="text-2xl font-bold tracking-tight">{workshopName}</h1>
            <p className="text-sm text-muted-foreground">Manufacturing & Fabrication Management</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <Card>
                <CardHeader>
                  <CardTitle>Welcome back</CardTitle>
                  <CardDescription>Enter your credentials to access your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input id="login-email" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required placeholder="you@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Input id="login-password" type={showLoginPassword ? "text" : "password"} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" className="pr-10" />
                        <button type="button" tabIndex={-1} onClick={() => setShowLoginPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showLoginPassword ? "Hide password" : "Show password"}>
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "Signing in..." : "Sign In"}
                    </Button>
                    <Link to="/forgot-password" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                      Forgot password?
                    </Link>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="signup">
              <Card>
                <CardHeader>
                  <CardTitle>Create account</CardTitle>
                  <CardDescription>Select your role then enter your invite code</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSignup} className="space-y-4">
                    {/* Role selector */}
                    <div className="space-y-2">
                      <Label>I am a…</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => { setSignupRole("client"); setSignupCompanyName(""); }}
                          className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${signupRole === "client" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                        >
                          <User className="h-6 w-6" />
                          <span className="font-medium">Client</span>
                          <span className="text-xs text-muted-foreground text-center">I'm a customer / client</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSignupRole("staff"); setSignupCompanyName(""); }}
                          className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-4 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${signupRole === "staff" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50"}`}
                        >
                          <Briefcase className="h-6 w-6" />
                          <span className="font-medium">Staff</span>
                          <span className="text-xs text-muted-foreground text-center">I work at the workshop</span>
                        </button>
                      </div>
                    </div>
                    {signupRole === "client" && (
                      <div className="space-y-2">
                        <Label htmlFor="signup-company-name">Company Name</Label>
                        <Input id="signup-company-name" value={signupCompanyName} onChange={(e) => setSignupCompanyName(e.target.value)} required placeholder="Acme Ltd." />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="signup-first-name">{signupRole === "client" ? "Contact First Name" : "First Name"}</Label>
                        <Input id="signup-first-name" value={signupFirstName} onChange={(e) => setSignupFirstName(e.target.value)} required placeholder="John" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-last-name">{signupRole === "client" ? "Contact Last Name" : "Last Name"}</Label>
                        <Input id="signup-last-name" value={signupLastName} onChange={(e) => setSignupLastName(e.target.value)} required placeholder="Doe" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required placeholder="you@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Input id="signup-password" type={showSignupPassword ? "text" : "password"} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} placeholder="••••••••" autoComplete="new-password" className="pr-10" />
                        <button type="button" tabIndex={-1} onClick={() => setShowSignupPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showSignupPassword ? "Hide password" : "Show password"}>
                          {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Input id="signup-confirm-password" type={showSignupConfirm ? "text" : "password"} value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} required minLength={6} placeholder="••••••••" autoComplete="new-password" className="pr-10" />
                        <button type="button" tabIndex={-1} onClick={() => setShowSignupConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showSignupConfirm ? "Hide password" : "Show password"}>
                          {showSignupConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-invite-code">Invite Code</Label>
                      <Input
                        id="signup-invite-code"
                        value={signupInviteCode}
                        onChange={(e) => setSignupInviteCode(e.target.value)}
                        required
                        placeholder="Enter the code provided by your workshop"
                        autoComplete="off"
                        maxLength={64}
                      />
                      <p className="text-xs text-muted-foreground">
                        Don't have one? Ask your workshop admin to issue you an invite code.
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <div className="text-center text-xs text-muted-foreground mt-6 space-y-1">
            <p>Shoplane is powered by Blumint Workspace · © {new Date().getFullYear()} Blumint Digital Limited · Registered in England and Wales · Company No. 15709531</p>
            <p>
              <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
              {" · "}
              <Link to="/terms" className="hover:underline">Terms of Service</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Right side - Hero image */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        <img
          src={loginImageUrl ?? "/auth-hero.jpg"}
          alt="Workshop"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            // If the default image isn't found, fall back to the gradient placeholder
            const target = e.currentTarget;
            target.style.display = "none";
            target.nextElementSibling?.classList.remove("hidden");
          }}
        />
        {/* Gradient fallback — hidden when image loads, shown on image error */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/90 items-center justify-center hidden">
          <div className="text-center space-y-4 px-12">
            <img src={resolveLogoUrl(logoUrl)} alt={workshopName} className="h-16 w-16 rounded-lg object-contain mx-auto" onError={useDefaultLogoOnError} />
            <h2 className="text-3xl font-bold text-primary-foreground">{workshopName}</h2>
            <p className="text-primary-foreground/70 text-lg max-w-sm mx-auto">
              Streamline your manufacturing & fabrication workflow with powerful job tracking, inventory management, and client collaboration.
            </p>
          </div>
        </div>
        <div className="absolute inset-0 bg-black/30 flex items-end p-8">
          <div className="text-white">
            <h2 className="text-2xl font-bold">{workshopName}</h2>
            <p className="text-white/70 text-sm mt-1">Manufacturing & Fabrication Management</p>
          </div>
        </div>
      </div>
    </div>
  );
}
