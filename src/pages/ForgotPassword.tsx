import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Wrench, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [workshopName, setWorkshopName] = useState("Workshop Manager");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast.success("Check your email for the reset link");
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset email");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Forgot Password</CardTitle>
            <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">A password reset link has been sent to <strong>{email}</strong>. Check your inbox.</p>
                <Link to="/auth">
                  <Button variant="outline" className="w-full"><ArrowLeft className="mr-2 h-4 w-4" />Back to Sign In</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Sending..." : "Send Reset Link"}
                </Button>
                <Link to="/auth" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                  Back to Sign In
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
