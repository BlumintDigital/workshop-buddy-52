import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, ArrowLeft, Lightbulb, LifeBuoy, Clock } from "lucide-react";
import { toast } from "sonner";
import { notifyRole } from "@/lib/notifications";
import { sendEmail, bugReportEmailHtml } from "@/lib/email";

export default function ReportIssue() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [pageUrl, setPageUrl] = useState(window.location.origin);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Please fill in the title and description");
      return;
    }
    if (!user) return;

    setSubmitting(true);
    const { error } = await (supabase.from("bug_reports" as any) as any).insert({
      user_id: user.id,
      title: title.trim(),
      description: description.trim(),
      severity,
      page_url: pageUrl.trim() || null,
    });

    if (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }

    // Notify all admins in-app
    await notifyRole(
      "admin",
      "New Issue Report",
      `${severity.toUpperCase()} — ${title.trim()}`,
      "/admin/feedback"
    );

    // Email is sent server-side via send-email (mode: bug_report). The function
    // enforces email_notifications_enabled and resolves the admin recipient from
    // admin-only workshop_admin_contacts; never exposed to the client.
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const submitterName = profile?.full_name || user.email || "A user";
    const feedbackLink = `${window.location.origin}/admin/feedback`;

    const { data: emailData, error: emailError } = await supabase.functions.invoke("send-email", {
      body: {
        mode: "bug_report",
        subject: `[${severity.toUpperCase()}] Issue Report: ${title.trim()}`,
        report: {
          title: title.trim(),
          description: description.trim(),
          severity,
          pageUrl: pageUrl.trim(),
          submitterName,
          feedbackLink,
        },
      },
    });

    if (emailError || (emailData as any)?.error) {
      const msg = (emailData as any)?.error || emailError?.message || "Email delivery failed";
      toast.error(`Report saved but email failed: ${msg}`);
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto space-y-6 py-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Report Submitted</h2>
              <p className="text-muted-foreground mt-1">
                Thank you for letting us know. Our team has been notified and will look into this.
              </p>
            </div>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />Go Back
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Report an Issue</h2>
          <p className="text-muted-foreground">
            Encountered a bug or something not working? Let us know and we'll fix it.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 min-w-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  Issue Details
                </CardTitle>
                <CardDescription>Describe what happened as clearly as possible.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="issue-title">Title *</Label>
                    <Input
                      id="issue-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Invoice PDF download not working"
                      className="mt-1"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="issue-severity">Severity</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low — minor inconvenience</SelectItem>
                        <SelectItem value="medium">Medium — functionality affected</SelectItem>
                        <SelectItem value="high">High — blocking my work</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="issue-description">Description *</Label>
                    <Textarea
                      id="issue-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what you were doing, what you expected to happen, and what actually happened..."
                      rows={6}
                      className="mt-1"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="issue-page">Page / URL</Label>
                    <Input
                      id="issue-page"
                      value={pageUrl}
                      onChange={(e) => setPageUrl(e.target.value)}
                      placeholder="Which page were you on?"
                      className="mt-1"
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? "Submitting…" : "Submit Report"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6">
            <Card tone="butter">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Write a great report</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>• Include the steps you took before the problem appeared.</p>
                <p>• Mention what you expected vs. what actually happened.</p>
                <p>• Note error messages word-for-word if you saw any.</p>
                <p>• Pick the severity that matches the impact on your work.</p>
              </CardContent>
            </Card>

            <Card tone="mist">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <LifeBuoy className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">What happens next</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Admins are notified instantly in-app and by email.</p>
                <p>High-severity reports are triaged first.</p>
              </CardContent>
            </Card>

            <Card tone="sky">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Response times</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">High</span><span className="font-medium">Within 1 business day</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Medium</span><span className="font-medium">2–3 business days</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Low</span><span className="font-medium">Next release</span></div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
