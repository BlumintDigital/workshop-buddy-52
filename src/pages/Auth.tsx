import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth, getRoleDashboardPath } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";

export default function Auth() {
  const { signIn, signUp, user, role, loading } = useAuth();
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

  useEffect(() => {
    if (!loading && user && role) {
      navigate(getRoleDashboardPath(role), { replace: true });
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    supabase
      .from("workshop_settings")
      .select("login_image_url, workshop_name, logo_url")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if ((data as any)?.login_image_url) setLoginImageUrl((data as any).login_image_url);
        if ((data as any)?.workshop_name) setWorkshopName((data as any).workshop_name);
        if ((data as any)?.logo_url) setLogoUrl((data as any).logo_url);
      });
  }, []);

  if (loading) return <LoadingScreen />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const nextRole = await signIn(loginEmail, loginPassword);
      toast.success("Signed in successfully");
      if (nextRole) {
        navigate(getRoleDashboardPath(nextRole), { replace: true });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in");
    } finally {
      setSubmitting(false);
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
      toast.success("Account created! Check your email to verify.");
    } catch (err: any) {
      toast.error(err.message || "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex flex-1 items-center justify-center bg-background p-6 sm:p-8">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={workshopName} className="h-12 w-12 rounded-lg object-contain" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wrench className="h-6 w-6" />
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
              <h2 className="text-2xl font-bold">Workshop Manager</h2>
              <p className="text-white/70 text-sm mt-1">Manufacturing & Fabrication Management</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
