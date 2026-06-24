import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wrench, ShieldCheck, KeyRound } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function Auth() {
  const { signIn, signUp, user, role, loading, needsMfaVerification, clearMfaFlag } = useAuth();
  const navigate = useNavigate();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginImageUrl, setLoginImageUrl] = useState<string | null>(null);
  const [workshopName, setWorkshopName] = useState<string>("Workshop Manager");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [emailConfirmationSent, setEmailConfirmationSent] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");

  // MFA state
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [pendingRole, setPendingRole] = useState<string | null>(null);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await signIn(loginEmail, loginPassword);
      if (result.needsMfa && result.factorId) {
        setMfaStep(true);
        setMfaFactorId(result.factorId);
        setPendingRole(result.role);
        toast.info("Please enter your 2FA code");
      } else {
        toast.success("Signed in successfully");
        if (result.role) {
          navigate(getRoleDashboardPath(result.role), { replace: true });
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFactorId || mfaCode.length !== 6) return;
    setMfaSubmitting(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: mfaCode,
      });
      if (verifyError) throw verifyError;

      clearMfaFlag();
      setMfaStep(false);
      setMfaCode("");
      toast.success("Signed in successfully");
      navigate(getRoleDashboardPath(pendingRole as any), { replace: true });
    } catch (err: any) {
      toast.error(err.message || "Invalid verification code");
      setMfaCode("");
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
    setSubmitting(true);
    try {
      const fullName = `${signupFirstName.trim()} ${signupLastName.trim()}`;
      await signUp(signupEmail, signupPassword, fullName);
      setConfirmationEmail(signupEmail);
      setEmailConfirmationSent(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to create account");
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
            {logoUrl ? (
              <img src={logoUrl} alt={workshopName} className="h-16 w-16 rounded-lg object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench className="h-6 w-6" />
              </div>
            )}
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
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Two-Factor Authentication</h1>
            <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app</p>
          </div>
          <Card>
            <CardContent className="pt-6">
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
                <Button type="submit" className="w-full" disabled={mfaSubmitting || mfaCode.length !== 6}>
                  {mfaSubmitting ? "Verifying..." : "Verify"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMfaStep(false);
                    setMfaCode("");
                    clearMfaFlag();
                    supabase.auth.signOut();
                  }}
                >
                  Cancel
                </Button>
              </form>
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
            {logoUrl ? (
              <img src={logoUrl} alt={workshopName} className="h-40 w-40 rounded-2xl object-contain drop-shadow-md" />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <Wrench className="h-20 w-20" />
              </div>
            )}
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
                      <Input id="login-password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required placeholder="••••••••" />
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
                  <CardDescription>New accounts are assigned the Client role by default</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="signup-first-name">First Name</Label>
                        <Input id="signup-first-name" value={signupFirstName} onChange={(e) => setSignupFirstName(e.target.value)} required placeholder="John" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="signup-last-name">Last Name</Label>
                        <Input id="signup-last-name" value={signupLastName} onChange={(e) => setSignupLastName(e.target.value)} required placeholder="Doe" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required placeholder="you@example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input id="signup-password" type="password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                      <Input id="signup-confirm-password" type="password" value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? "Creating account..." : "Create Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right side - Hero image */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {loginImageUrl ? (
          <img
            src={loginImageUrl}
            alt="Workshop"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/90 flex items-center justify-center">
            <div className="text-center space-y-4 px-12">
              {logoUrl ? (
                <img src={logoUrl} alt={workshopName} className="h-16 w-16 rounded-lg object-contain mx-auto" />
              ) : (
                <Wrench className="h-16 w-16 text-primary-foreground/80 mx-auto" />
              )}
              <h2 className="text-3xl font-bold text-primary-foreground">{workshopName}</h2>
              <p className="text-primary-foreground/70 text-lg max-w-sm mx-auto">
                Streamline your manufacturing & fabrication workflow with powerful job tracking, inventory management, and client collaboration.
              </p>
            </div>
          </div>
        )}
        {loginImageUrl && (
          <div className="absolute inset-0 bg-black/30 flex items-end p-8">
            <div className="text-white">
              <h2 className="text-2xl font-bold">{workshopName}</h2>
              <p className="text-white/70 text-sm mt-1">Manufacturing & Fabrication Management</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
