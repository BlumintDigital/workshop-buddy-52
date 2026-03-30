import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const defaultSettings = {
  workshop_name: "",
  contact_email: "",
  phone: "",
  address: "",
  default_tax_rate: "0",
  currency: "USD",
  notify_job_status: true,
  notify_new_appointment: true,
  notify_low_inventory: true,
  email_notifications_enabled: false,
  from_email: "",
};

type Settings = typeof defaultSettings;

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("workshop_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            workshop_name: data.workshop_name ?? "",
            contact_email: data.contact_email ?? "",
            phone: data.phone ?? "",
            address: data.address ?? "",
            default_tax_rate: data.default_tax_rate?.toString() ?? "0",
            currency: data.currency ?? "USD",
            notify_job_status: data.notify_job_status ?? true,
            notify_new_appointment: data.notify_new_appointment ?? true,
            notify_low_inventory: data.notify_low_inventory ?? true,
            email_notifications_enabled: data.email_notifications_enabled ?? false,
            from_email: data.from_email ?? "",
          });
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("workshop_settings").upsert({
      id: 1,
      workshop_name: settings.workshop_name || null,
      contact_email: settings.contact_email || null,
      phone: settings.phone || null,
      address: settings.address || null,
      default_tax_rate: parseFloat(settings.default_tax_rate) || 0,
      currency: settings.currency || "USD",
      notify_job_status: settings.notify_job_status,
      notify_new_appointment: settings.notify_new_appointment,
      notify_low_inventory: settings.notify_low_inventory,
      email_notifications_enabled: settings.email_notifications_enabled,
      from_email: settings.from_email || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
  };

  const set = (key: keyof Settings, value: string | boolean) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) return <DashboardLayout><p className="p-8 text-muted-foreground">Loading...</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Workshop configuration</p>
        </div>

        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
                <CardDescription>Basic workshop information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="workshop_name">Workshop Name</Label>
                  <Input id="workshop_name" value={settings.workshop_name} onChange={(e) => set("workshop_name", e.target.value)} placeholder="My Workshop" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="contact_email">Contact Email</Label>
                  <Input id="contact_email" type="email" value={settings.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="contact@workshop.com" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={settings.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 (555) 000-0000" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={settings.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Workshop St, City, State" className="mt-1" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>Default values used when creating invoices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="default_tax_rate">Default Tax Rate (%)</Label>
                  <Input id="default_tax_rate" type="number" min="0" max="100" step="0.1" value={settings.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value)} className="mt-1 w-32" />
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Input id="currency" value={settings.currency} onChange={(e) => set("currency", e.target.value)} placeholder="USD" className="mt-1 w-32" maxLength={3} />
                  <p className="text-xs text-muted-foreground mt-1">3-letter ISO currency code (e.g. USD, EUR, GBP)</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>In-app Notifications</CardTitle>
                <CardDescription>Choose which events create in-app notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Job status changes</p>
                    <p className="text-xs text-muted-foreground">Notify client and staff when a job status updates</p>
                  </div>
                  <Switch checked={settings.notify_job_status} onCheckedChange={(v) => set("notify_job_status", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">New appointments</p>
                    <p className="text-xs text-muted-foreground">Notify admin when a client books an appointment</p>
                  </div>
                  <Switch checked={settings.notify_new_appointment} onCheckedChange={(v) => set("notify_new_appointment", v)} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Low inventory alerts</p>
                    <p className="text-xs text-muted-foreground">Notify admin when stock falls below minimum</p>
                  </div>
                  <Switch checked={settings.notify_low_inventory} onCheckedChange={(v) => set("notify_low_inventory", v)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>
                  Send emails for key events via Resend. Requires a Resend API key configured as a Supabase secret.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Enable email notifications</p>
                    <p className="text-xs text-muted-foreground">Send emails for job updates, quotes, and appointments</p>
                  </div>
                  <Switch
                    checked={settings.email_notifications_enabled}
                    onCheckedChange={(v) => set("email_notifications_enabled", v)}
                  />
                </div>
                <div>
                  <Label htmlFor="from_email">From Email Address</Label>
                  <Input
                    id="from_email"
                    type="email"
                    value={settings.from_email}
                    onChange={(e) => set("from_email", e.target.value)}
                    placeholder="noreply@yourworkshop.com"
                    className="mt-1"
                    disabled={!settings.email_notifications_enabled}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Must be a verified sender domain in Resend</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-dashed">
              <CardContent className="pt-5 space-y-2">
                <p className="text-sm font-medium">Setup instructions</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Create a free account at <strong>resend.com</strong> and get your API key</li>
                  <li>Run: <code className="bg-muted px-1 rounded">supabase secrets set RESEND_API_KEY=your_key</code></li>
                  <li>Run: <code className="bg-muted px-1 rounded">supabase functions deploy send-email</code></li>
                  <li>Enable the toggle above and set your from address, then save</li>
                </ol>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </DashboardLayout>
  );
}
