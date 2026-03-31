import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Database, Trash2, Loader2, Upload, ImageIcon, X } from "lucide-react";

const currencies = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "GHS", label: "GHS — Ghanaian Cedi" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "AED", label: "AED — UAE Dirham" },
];

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
  login_image_url: "",
  logo_url: "",
};

type Settings = typeof defaultSettings;

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
            email_notifications_enabled: (data as any).email_notifications_enabled ?? false,
            from_email: (data as any).from_email ?? "",
            login_image_url: (data as any).login_image_url ?? "",
          });
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await (supabase.from("workshop_settings") as any).upsert({
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
      login_image_url: settings.login_image_url || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
  };

  const handleUploadLoginImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploadingImage(true);
    const ext = file.name.split(".").pop();
    const path = `login-image-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("workshop-assets").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error(uploadErr.message); setUploadingImage(false); return; }
    const { data: urlData } = supabase.storage.from("workshop-assets").getPublicUrl(path);
    set("login_image_url", urlData.publicUrl);
    setUploadingImage(false);
    toast.success("Image uploaded — remember to save settings");
    e.target.value = "";
  };

  const handleRemoveLoginImage = () => {
    set("login_image_url", "");
  };

  const handleSeedData = async () => {
    setSeeding(true);
    const { data, error } = await supabase.functions.invoke("seed-data");
    setSeeding(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Failed to generate sample data"); return; }
    const counts = data?.counts || {};
    const total = Object.values(counts).reduce((a: number, b: any) => a + (b as number), 0);
    toast.success(`Generated ${total} sample records across ${Object.keys(counts).length} tables`);
  };

  const handleDeleteData = async () => {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-data");
    setDeleting(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || "Failed to delete data"); return; }
    const deleted = data?.deleted || {};
    const total = Object.values(deleted).reduce((a: number, b: any) => a + (b as number), 0);
    toast.success(`Deleted ${total} records across ${Object.keys(deleted).length} tables`);
  };

  const set = (key: keyof Settings, value: string | boolean) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  if (loading) return <DashboardLayout><p className="p-8 text-muted-foreground">Loading...</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h2>
          <p className="text-muted-foreground">Workshop configuration</p>
        </div>

        <Tabs defaultValue="general">
          <TabsList className="grid grid-cols-3 w-full h-auto">
            <TabsTrigger value="general" className="text-xs sm:text-sm">General</TabsTrigger>
            <TabsTrigger value="billing" className="text-xs sm:text-sm">Billing</TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs sm:text-sm">Notifications</TabsTrigger>
            <TabsTrigger value="branding" className="text-xs sm:text-sm">Branding</TabsTrigger>
            <TabsTrigger value="email" className="text-xs sm:text-sm">Email</TabsTrigger>
            <TabsTrigger value="data" className="text-xs sm:text-sm">Data</TabsTrigger>
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
                  <Input id="default_tax_rate" type="number" min="0" max="100" step="0.1" value={settings.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value)} className="mt-1 w-full sm:w-32" />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={settings.currency} onValueChange={(v) => set("currency", v)}>
                    <SelectTrigger className="mt-1 w-full sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Job status changes</p>
                    <p className="text-xs text-muted-foreground">Notify client and staff when a job status updates</p>
                  </div>
                  <Switch checked={settings.notify_job_status} onCheckedChange={(v) => set("notify_job_status", v)} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">New appointments</p>
                    <p className="text-xs text-muted-foreground">Notify admin when a client books an appointment</p>
                  </div>
                  <Switch checked={settings.notify_new_appointment} onCheckedChange={(v) => set("notify_new_appointment", v)} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Low inventory alerts</p>
                    <p className="text-xs text-muted-foreground">Notify admin when stock falls below minimum</p>
                  </div>
                  <Switch checked={settings.notify_low_inventory} onCheckedChange={(v) => set("notify_low_inventory", v)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Login Page Image</CardTitle>
                <CardDescription>Upload a hero image that appears on the sign-in page</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {settings.login_image_url ? (
                  <div className="relative rounded-lg overflow-hidden border">
                    <img src={settings.login_image_url} alt="Login hero" className="w-full h-48 object-cover" />
                    <Button size="icon" variant="destructive" className="absolute top-2 right-2 h-7 w-7" onClick={handleRemoveLoginImage}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center">
                    <ImageIcon className="h-10 w-10 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No image set — a gradient will be shown</p>
                  </div>
                )}
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadLoginImage} />
                <Button variant="outline" disabled={uploadingImage} onClick={() => imageInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />{uploadingImage ? "Uploading..." : "Upload Image"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>Send emails for key events via Resend. Requires a Resend API key configured as a Supabase secret.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Enable email notifications</p>
                    <p className="text-xs text-muted-foreground">Send emails for job updates, quotes, and appointments</p>
                  </div>
                  <Switch checked={settings.email_notifications_enabled} onCheckedChange={(v) => set("email_notifications_enabled", v)} />
                </div>
                <div>
                  <Label htmlFor="from_email">From Email Address</Label>
                  <Input id="from_email" type="email" value={settings.from_email} onChange={(e) => set("from_email", e.target.value)} placeholder="noreply@yourworkshop.com" className="mt-1" disabled={!settings.email_notifications_enabled} />
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

          <TabsContent value="data" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Generate Sample Data</CardTitle>
                <CardDescription>Populate the database with realistic sample data for testing.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleSeedData} disabled={seeding}>
                  {seeding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Database className="mr-2 h-4 w-4" />Generate Sample Data</>}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Creates ~50+ records across all tables.</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" />Delete All Data</CardTitle>
                <CardDescription>Remove all business data. User accounts, roles, and settings are preserved.</CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={deleting}>
                      {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : <><Trash2 className="mr-2 h-4 w-4" />Delete All Data</>}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete all jobs, appointments, inventory items, invoices, and notifications. This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes, delete everything</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <p className="text-xs text-muted-foreground mt-2">This action is irreversible.</p>
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
