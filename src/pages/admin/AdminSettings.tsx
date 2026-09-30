import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFeature } from "@/hooks/useFeatureFlags";
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
import { Bell, Building2, Database, Trash2, Loader2, Upload, ImageIcon, X, Users, AlertTriangle, Lock, Mail, Palette, Receipt, Send, Download, Plug } from "lucide-react";
import IntegrationsPanel from "@/components/settings/IntegrationsPanel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { getCustomLogoUrl, resolveLogoUrl, useDefaultLogoOnError } from "@/lib/branding";
import { useAdminOnboarding } from "@/hooks/useAdminOnboarding";
import { useAuth } from "@/hooks/useAuth";
import { PageBar } from "@/components/dashboard/PageBar";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage } from "@/lib/friendlyError";


import { CURRENCIES } from "@/lib/currencies";
import { PRESETS, hexToHslString, hslStringToHex, applyBrandColors, DEFAULT_BRAND, contrastWithWhite, ensureReadablePrimary } from "@/lib/brand-colors";
const currencies = CURRENCIES;

const defaultSettings = {
  workshop_name: "",
  contact_email: "",
  phone: "",
  address: "",
  default_tax_rate: "0",
  monthly_goal: "",
  project_ref_prefix: "EDL",
  purchase_manager_limit: "1000",
  overhead_percent: "15",
  currency: "USD",
  enabled_currencies: ["USD"] as string[],
  notify_job_status: true,
  notify_new_appointment: true,
  notify_low_inventory: true,
  email_notifications_enabled: false,
  from_email: "",
  super_admin_email: "",
  login_image_url: "",
  logo_url: "",
  brand_primary_hsl: "" as string,
  brand_accent_hsl: "" as string,
};

type Settings = typeof defaultSettings;


export default function AdminSettings() {
  const { role, loading: authLoading } = useAuth();
  const isAdmin = role === "admin";
  const goalsEnabled = useFeature("goals");
  const accountingEnabled = useFeature("accounting_sync");
  const appointmentsEnabled = useFeature("appointments");
  const canGenerateSampleData = useFeature("generate_sample_data");
  const canSetupDemoUsers = useFeature("setup_demo_users");
  const canBackupRestore = useFeature("backup_restore");
  const { resetOnboarding, updating: onboardingUpdating } = useAdminOnboarding();
  const [settings, setSettings] = useState<Settings>({ ...defaultSettings });
  // Snapshot of last loaded/saved settings — used to detect unsaved edits.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [settingUpDemo, setSettingUpDemo] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  // Links (and the QuickBooks/Xero sign-in) can open a tab directly with ?tab=.
  const [activeTab, setActiveTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    return SETTINGS_SECTIONS.some((s) => s.value === t) ? (t as string) : "general";
  });
  const { state: sidebarState } = useSidebar();
  const [currentMonthGoal, setCurrentMonthGoal] = useState<number | null | undefined>(undefined);
  const [pastGoals, setPastGoals] = useState<{ year: number; month: number; goal_amount: number }[]>([]);
  const [goalInput, setGoalInput] = useState("");
  const [settingGoal, setSettingGoal] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      supabase.from("workshop_settings").select("*").eq("id", 1).maybeSingle(),
      (supabase.from("workshop_admin_contacts" as any) as any)
        .select("super_admin_email").eq("id", 1).maybeSingle(),
    ]).then(([{ data }, { data: adminData }]) => {
      if (data) {
        const loaded: Settings = {
          workshop_name: data.workshop_name ?? "",
          contact_email: data.contact_email ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          default_tax_rate: data.default_tax_rate?.toString() ?? "0",
          project_ref_prefix: data.project_ref_prefix ?? "EDL",
          purchase_manager_limit: data.purchase_manager_limit?.toString() ?? "1000",
          overhead_percent: data.overhead_percent?.toString() ?? "15",
          monthly_goal: (data as any).monthly_goal?.toString() ?? "",
          currency: data.currency ?? "USD",
          enabled_currencies: Array.isArray((data as any).enabled_currencies) && (data as any).enabled_currencies.length > 0
            ? (data as any).enabled_currencies
            : [data.currency ?? "USD"],
          notify_job_status: data.notify_job_status ?? true,
          notify_new_appointment: data.notify_new_appointment ?? true,
          notify_low_inventory: data.notify_low_inventory ?? true,
          email_notifications_enabled: (data as any).email_notifications_enabled ?? false,
          from_email: (data as any).from_email ?? "",
          super_admin_email: (adminData as any)?.super_admin_email ?? "",
          login_image_url: (data as any).login_image_url ?? "",
          logo_url: (data as any).logo_url ?? "",
          brand_primary_hsl: (data as any).brand_primary_hsl ?? "",
          brand_accent_hsl: (data as any).brand_accent_hsl ?? "",
        };
        setSettings(loaded);
        setSavedSnapshot(JSON.stringify(loaded));
      } else {
        setSavedSnapshot(JSON.stringify({ ...defaultSettings }));
      }
      setLoading(false);
    });
  }, []);

  const isDirty = savedSnapshot !== null && JSON.stringify(settings) !== savedSnapshot;

  // Warn before leaving the page with unsaved settings edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const loadMonthlyGoals = async () => {
    const now = new Date();
    const { data } = await (supabase as any)
      .from("monthly_revenue_goals")
      .select("year, month, goal_amount")
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (!data) return;
    const current = data.find((g: any) => g.year === now.getFullYear() && g.month === now.getMonth() + 1);
    setCurrentMonthGoal(current ? parseFloat(current.goal_amount) : null);
    setPastGoals(data.filter((g: any) => !(g.year === now.getFullYear() && g.month === now.getMonth() + 1)));
  };

  useEffect(() => {
    if (goalsEnabled) {
      void loadMonthlyGoals();
    } else {
      setCurrentMonthGoal(null);
      setPastGoals([]);
    }
  }, [goalsEnabled]);

  const handleSetGoal = async () => {
    if (!goalsEnabled) {
      toast.error("Goals feature is disabled");
      return;
    }
    const amount = parseFloat(goalInput);
    if (!amount || amount <= 0) { toast.error("Enter a valid goal amount"); return; }
    const now = new Date();
    setSettingGoal(true);
    const { error } = await (supabase as any).from("monthly_revenue_goals").insert({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      goal_amount: amount,
    });
    setSettingGoal(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Goal set for this month");
    setGoalInput("");
    loadMonthlyGoals();
  };

  const handleSave = async () => {
    if (!isAdmin) { toast.error("Only administrators can update workshop settings."); return; }
    const prefix = settings.project_ref_prefix.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,6}$/.test(prefix)) { toast.error("The project ID prefix must be 2 to 6 letters or numbers, like EDL."); return; }
    setSaving(true);
    const { error } = await (supabase.from("workshop_settings") as any).upsert({
      id: 1,
      workshop_name: settings.workshop_name || null,
      contact_email: settings.contact_email || null,
      phone: settings.phone || null,
      address: settings.address || null,
      default_tax_rate: parseFloat(settings.default_tax_rate) || 0,
      monthly_goal: parseFloat(settings.monthly_goal) || null,
      project_ref_prefix: prefix,
      purchase_manager_limit: Math.max(0, parseFloat(settings.purchase_manager_limit) || 0),
      overhead_percent: Math.min(100, Math.max(0, parseFloat(settings.overhead_percent) || 0)),
      currency: settings.currency || "USD",
      enabled_currencies: settings.enabled_currencies?.includes(settings.currency)
        ? settings.enabled_currencies
        : [...(settings.enabled_currencies ?? []), settings.currency || "USD"],
      notify_job_status: settings.notify_job_status,
      notify_new_appointment: settings.notify_new_appointment,
      notify_low_inventory: settings.notify_low_inventory,
      email_notifications_enabled: settings.email_notifications_enabled,
      from_email: settings.from_email || null,
      login_image_url: settings.login_image_url || null,
      logo_url: getCustomLogoUrl(settings.logo_url),
      brand_primary_hsl: settings.brand_primary_hsl || null,
      brand_accent_hsl: settings.brand_accent_hsl || null,
    });
    if (error) { setSaving(false); toast.error(error.message); return; }

    const { error: adminErr } = await (supabase.from("workshop_admin_contacts" as any) as any).upsert({
      id: 1,
      super_admin_email: settings.super_admin_email || null,
    });
    setSaving(false);
    if (adminErr) { toast.error(adminErr.message); return; }
    setSavedSnapshot(JSON.stringify(settings));
    toast.success("Settings saved — invoices and PDFs will refresh");
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

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop();
    const path = `logo-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("workshop-assets").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error(uploadErr.message); setUploadingLogo(false); return; }
    const { data: urlData } = supabase.storage.from("workshop-assets").getPublicUrl(path);
    set("logo_url", urlData.publicUrl);
    setUploadingLogo(false);
    toast.success("Logo uploaded — remember to save settings");
    e.target.value = "";
  };

  const handleRemoveLogo = () => {
    set("logo_url", "");
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

  const handleSetupDemo = async () => {
    setSettingUpDemo(true);

    // 1. Create or reset the accounts used by the one-click /demo page.
    const { data, error } = await supabase.functions.invoke("setup-demo");
    if (error || data?.error) {
      setSettingUpDemo(false);
      toast.error(data?.error || error?.message || "Failed to set up demo users");
      return;
    }

    // Surface generated passwords ONCE — copy them now.
    if (Array.isArray(data?.users)) {
      const credLines = data.users.map((u: any) => `${u.email} → ${u.password}`).join("\n");
      console.log("[Demo accounts — copy these passwords now]\n" + credLines);
      toast.info("Demo passwords printed to console — copy now (not stored)", { duration: 10000 });
    }

    // 2. Force-set roles (edge function may race against the auto-assign trigger)
    const DEMO_ROLE_MAP: Record<string, string> = {
      "Demo Admin": "admin",
      "Demo Manager": "manager",
      "Demo Staff": "staff",
      "Demo Client": "client",
    };
    const { data: demoProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("full_name", Object.keys(DEMO_ROLE_MAP));

    const profileMap: Record<string, string> = {}; // full_name -> id
    for (const profile of demoProfiles || []) {
      if (!profile.full_name) continue;
      const role = DEMO_ROLE_MAP[profile.full_name];
      if (role) {
        await supabase.from("user_roles").update({ role } as any).eq("user_id", profile.id);
        profileMap[profile.full_name] = profile.id;
      }
    }

    const staffId = profileMap["Demo Staff"];
    const clientId = profileMap["Demo Client"];
    const managerId = profileMap["Demo Manager"];
    const adminId = profileMap["Demo Admin"];

    if (!staffId || !clientId) {
      setSettingUpDemo(false);
      toast.success("Demo users ready! Roles updated. Visit /demo to log in.", { duration: 6000 });
      return;
    }

    // 3. Clear any existing demo-tagged data so re-runs are idempotent
    await supabase.from("jobs").delete().like("title", "[DEMO]%");
    await supabase.from("appointments").delete().like("title", "[DEMO]%");
    await supabase.from("invoices").delete().like("invoice_number", "DEMO-%");

    const today = new Date();
    const d = (offsetDays: number) => {
      const dt = new Date(today);
      dt.setDate(dt.getDate() + offsetDays);
      return dt.toISOString().split("T")[0];
    };

    // 4. Jobs — assigned to Demo Staff, client is Demo Client
    const { data: insertedJobs } = await supabase.from("jobs").insert([
      { title: "[DEMO] Lathe spindle bearing replacement", description: "Headstock bearings noisy at speed. Replace bearings and seals, check spindle runout.", status: "completed", priority: "high", client_id: clientId, assigned_staff_id: staffId, estimated_hours: 4, actual_hours: 3.5, due_date: d(-5) },
      { title: "[DEMO] Electric motor rewind", description: "7.5 kW motor tripping on start. Test windings, rewind the stator and load test.", status: "in_progress", priority: "high", client_id: clientId, assigned_staff_id: staffId, estimated_hours: 2, due_date: d(1) },
      { title: "[DEMO] Gearbox overhaul", description: "Conveyor gearbox leaking oil with worn gears. Strip, replace seals and bearings, refill.", status: "in_progress", priority: "medium", client_id: clientId, assigned_staff_id: staffId, estimated_hours: 1.5, due_date: d(2) },
      { title: "[DEMO] Fabricate machine guard", description: "Mild steel guard for the bandsaw to the customer's drawing, powder coated.", status: "pending", priority: "medium", client_id: clientId, assigned_staff_id: staffId, estimated_hours: 3, due_date: d(5) },
      { title: "[DEMO] Pump impeller repair", description: "Worn impeller and leaking mechanical seal on a centrifugal pump.", status: "pending", priority: "low", client_id: clientId, assigned_staff_id: staffId, estimated_hours: 2, due_date: d(8) },
    ]).select("id, status, client_id");

    // 5. Job tasks for each job
    const taskMap: Record<string, string[]> = {
      "completed": ["Strip and inspect", "Order parts", "Repair and reassemble", "Test run"],
      "in_progress": ["Strip and inspect", "Repair and reassemble", "Test run"],
      "pending": ["Strip and inspect", "Repair and reassemble"],
    };
    const jobTasks: any[] = [];
    for (const job of insertedJobs || []) {
      const tasks = taskMap[job.status] || taskMap["pending"];
      tasks.forEach((title, i) => {
        jobTasks.push({
          job_id: job.id,
          title,
          status: job.status === "completed" ? "completed" : i === 0 ? "in_progress" : "pending",
          assigned_to: staffId,
        });
      });
    }
    if (jobTasks.length) await supabase.from("job_tasks").insert(jobTasks);

    // 6. Appointments — linked to Demo Client
    if (appointmentsEnabled) {
      await supabase.from("appointments").insert([
        { title: "[DEMO] Site survey: conveyor line", client_id: clientId, appointment_date: d(1), appointment_time: "09:00", duration_minutes: 60, type: "inspection", status: "confirmed", description: "Measure up and assess the conveyor drive before quoting." },
        { title: "[DEMO] Motor drop-off", client_id: clientId, appointment_date: d(3), appointment_time: "10:30", duration_minutes: 30, type: "repair", status: "pending", description: "Customer bringing in a 7.5 kW motor that trips on start." },
        { title: "[DEMO] Quote review: gearbox", client_id: clientId, appointment_date: d(6), appointment_time: "14:00", duration_minutes: 45, type: "consultation", status: "confirmed", description: "Go through the gearbox overhaul quote with the client." },
      ]);
    }

    // 7. Invoices — for Demo Client
    const completedJob = (insertedJobs || []).find(j => j.status === "completed");
    const invoicesToInsert: any[] = [
      {
        invoice_number: "DEMO-001",
        client_id: clientId,
        job_id: completedJob?.id || null,
        status: "paid",
        subtotal: 310.00,
        tax_rate: 8.5,
        tax_amount: 26.35,
        total: 336.35,
        due_date: d(-10),
        paid_at: new Date(today.getTime() - 8 * 86400000).toISOString(),
        notes: "Spindle bearing replacement completed. Parts and labour included.",
      },
      {
        invoice_number: "DEMO-002",
        client_id: clientId,
        job_id: null,
        status: "sent",
        subtotal: 185.00,
        tax_rate: 8.5,
        tax_amount: 15.73,
        total: 200.73,
        due_date: d(15),
        paid_at: null,
        notes: "Motor test report and rewind estimate.",
      },
      {
        invoice_number: "DEMO-003",
        client_id: clientId,
        job_id: null,
        status: "draft",
        subtotal: 450.00,
        tax_rate: 8.5,
        tax_amount: 38.25,
        total: 488.25,
        due_date: d(30),
        paid_at: null,
        notes: "Machine guard fabrication, awaiting client approval.",
      },
    ];
    const { data: insertedInvoices } = await supabase.from("invoices").insert(invoicesToInsert).select("id");

    // 8. Invoice line items
    const lineItems = [
      [{ description: "Angular contact bearings (pair)", quantity: 2, unit_price: 65, total: 130 }, { description: "Labour: strip, fit and runout check (3.5 hrs)", quantity: 1, unit_price: 140, total: 140 }, { description: "Shop supplies", quantity: 1, unit_price: 40, total: 40 }],
      [{ description: "Winding insulation and surge test", quantity: 1, unit_price: 95, total: 95 }, { description: "Technician labour (1 hr)", quantity: 1, unit_price: 75, total: 75 }, { description: "Written report", quantity: 1, unit_price: 15, total: 15 }],
      [{ description: "Mild steel fabrication", quantity: 1, unit_price: 220, total: 220 }, { description: "Powder coating", quantity: 1, unit_price: 155, total: 155 }, { description: "Labor (3 hrs)", quantity: 1, unit_price: 75, total: 75 }],
    ];
    for (let i = 0; i < (insertedInvoices || []).length; i++) {
      const items = lineItems[i] || lineItems[0];
      await supabase.from("invoice_items").insert(items.map(item => ({ ...item, invoice_id: insertedInvoices![i].id })));
    }

    // 9. Notifications for demo users
    const notifications = [
      { user_id: clientId, title: "Invoice Ready", message: "Invoice DEMO-002 has been sent. Total due: $200.73.", read: false, link: "/client/invoices" },
      ...(appointmentsEnabled ? [{ user_id: clientId, title: "Appointment Confirmed", message: `Your conveyor line site survey on ${d(1)} at 9:00 AM is confirmed.`, read: false, link: "/client/appointments" }] : []),
      { user_id: staffId, title: "New project assigned", message: "You have been assigned: Electric motor rewind. Due tomorrow.", read: false, link: "/staff/projects" },
      { user_id: staffId, title: "Project due soon", message: "Gearbox overhaul is due in 2 days.", read: true, link: "/staff/projects" },
      { user_id: managerId, title: "Invoice Overdue", message: "Check pending invoices — DEMO-002 is awaiting client payment.", read: false, link: "/manager/invoices" },
    ];
    await supabase.from("notifications").insert(notifications);

    setSettingUpDemo(false);
    toast.success(`Demo environment ready! Users, roles, projects and invoices are set${appointmentsEnabled ? ", including appointments" : ""}. Visit /demo to log in.`, { duration: 8000 });
  };

  const handleBackup = async () => {
    setBacking(true);
    const { data, error } = await supabase.functions.invoke("backup-data");
    setBacking(false);
    if (error || (data as { error?: string })?.error) {
      toast.error((data as { error?: string })?.error ?? (await friendlyErrorMessage(error, "Backup failed")));
      return;
    }
    const totalRows = Object.values((data as { manifest?: { row_counts?: Record<string, number> } })?.manifest?.row_counts ?? {}).reduce((a: number, b) => a + (b as number), 0);
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workshop-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Backup downloaded (${totalRows} rows)`);
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreFile(e.target.files?.[0] ?? null);
    e.target.value = "";
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreDialogOpen(false);
    setRestoreConfirmText("");
    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);
      const { data, error } = await supabase.functions.invoke("restore-data", { body: parsed });
      if (error || (data as { error?: string })?.error) {
        toast.error((data as { error?: string })?.error ?? (await friendlyErrorMessage(error, "Restore failed")), { duration: 12000 });
        return;
      }
      const totalRestored = Object.values((data as { restored?: Record<string, number> })?.restored ?? {}).reduce((a: number, b) => a + (b as number), 0);
      toast.success(`Restore complete — ${totalRestored} rows imported`);
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast.error("Failed to read backup file — ensure it is a valid JSON backup");
    } finally {
      setRestoring(false);
      setRestoreFile(null);
    }
  };

  const handleDeleteData = async () => {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-data");
    setDeleting(false);
    if (error || data?.error) { toast.error(data?.error || (await friendlyErrorMessage(error, "Failed to delete data"))); return; }
    const deleted = data?.deleted || {};
    const total = Object.values(deleted).reduce((a: number, b: any) => a + (b as number), 0);
    toast.success(`Deleted ${total} records across ${Object.keys(deleted).length} tables`);
  };

  const handleFactoryReset = async () => {
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("delete-data", {
      body: { reset_users: true },
    });
    setResetting(false);
    setResetDialogOpen(false);
    setResetConfirmText("");
    if (error || data?.error) {
      toast.error(data?.error || (await friendlyErrorMessage(error, "Factory reset failed")));
      return;
    }
    toast.success("Factory reset complete. Signing out...");
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate("/auth");
    }, 1500);
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailTestResult(null);
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { mode: "test_email" },
    });
    setTestingEmail(false);
    if (error || !(data as any)?.ok) {
      setEmailTestResult({ ok: false, message: (data as any)?.error || error?.message || "Unknown error" });
    } else {
      setEmailTestResult({ ok: true, message: `Test email sent to ${(data as any).sentTo}` });
    }
  };

  const handleResetOnboarding = async () => {
    await resetOnboarding();
    toast.success("Onboarding checklist reset");
  };

  const set = (key: keyof Settings, value: string | boolean | string[]) =>
    setSettings(prev => ({ ...prev, [key]: value }));

  if (loading || authLoading) return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4" aria-busy="true">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <Skeleton className="hidden h-72 md:block" />
          <Skeleton className="h-96" />
        </div>
      </div>
    </DashboardLayout>
  );

  if (!isAdmin) return (
    <DashboardLayout>
      <div className="max-w-2xl">
        <Alert variant="destructive">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to view or update workshop settings. Administrator access is required.
          </AlertDescription>
        </Alert>
      </div>
    </DashboardLayout>
  );

  const customLogoUrl = getCustomLogoUrl(settings.logo_url);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4 pb-24">
        <PageBar title="Settings" subtitle="Workshop details, billing, notifications, branding and data" />

        <Tabs value={activeTab} onValueChange={setActiveTab} orientation="vertical" className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <TabsList
            aria-label="Settings sections"
            className="-mx-3 flex h-auto justify-start gap-1.5 overflow-x-auto bg-transparent px-3 pb-1 [scrollbar-width:none] md:sticky md:top-20 md:mx-0 md:flex-col md:items-stretch md:gap-0.5 md:self-start md:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {SETTINGS_SECTIONS.filter((s) => s.value !== "integrations" || accountingEnabled).map(({ value, label, hint, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-9 shrink-0 justify-start gap-2 rounded-full border border-input bg-card px-3.5 text-sm font-medium text-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none md:h-auto md:rounded-md md:border-0 md:bg-transparent md:px-3 md:py-2.5 md:text-left md:hover:bg-secondary md:data-[state=active]:bg-primary"
              >
                <Icon className="hidden h-4 w-4 shrink-0 md:block" aria-hidden />
                <span className="flex flex-col items-start">
                  <span>{label}</span>
                  <span className="hidden text-xs font-normal md:block">{hint}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="min-w-0">
          <TabsContent value="general" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              <div className="space-y-4 lg:col-span-2 min-w-0">
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
                <Card>
                  <CardHeader>
                    <CardTitle>Onboarding</CardTitle>
                    <CardDescription>Bring back your admin setup checklist on the dashboard</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button type="button" variant="outline" onClick={handleResetOnboarding} disabled={onboardingUpdating}>
                      {onboardingUpdating ? "Resetting..." : "Reset onboarding checklist"}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Where this appears</CardTitle>
                    <CardDescription>How general info is used across the app</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>• <span className="text-foreground font-medium">Workshop name</span> is shown in the header, emails and invoice PDFs.</p>
                    <p>• <span className="text-foreground font-medium">Contact email & phone</span> appear on invoices and client communications.</p>
                    <p>• <span className="text-foreground font-medium">Address</span> is used as the footer on printed documents.</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Tips</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>• Use a contact email your team actually monitors.</p>
                    <p>• Configure the sender domain in the Email tab so messages don't land in spam.</p>
                    <p>• Brand colors and the logo live under the Branding tab.</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <button type="button" onClick={() => setActiveTab("branding")} className="block text-left text-primary hover:underline">→ Customize branding & logo</button>
                    <button type="button" onClick={() => setActiveTab("email")} className="block text-left text-primary hover:underline">→ Set up email delivery</button>
                    <button type="button" onClick={() => setActiveTab("notifications")} className="block text-left text-primary hover:underline">→ Manage notifications</button>
                    <button type="button" onClick={() => setActiveTab("data")} className="block text-left text-primary hover:underline">→ Data & backup tools</button>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </TabsContent>


          <TabsContent value="billing" className="mt-0 max-w-3xl">
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
                  <Label htmlFor="project_ref_prefix">Project ID prefix</Label>
                  <Input id="project_ref_prefix" value={settings.project_ref_prefix} maxLength={6} onChange={(e) => set("project_ref_prefix", e.target.value.toUpperCase())} className="mt-1 w-full font-mono sm:w-32" />
                  <p className="mt-1 text-xs text-muted-foreground">New projects get IDs like {settings.project_ref_prefix || "EDL"}-{new Date().toISOString().slice(0, 7).replace("-", "")}-001. Existing IDs never change.</p>
                </div>
                <div>
                  <Label htmlFor="purchase_manager_limit">Managers can approve purchases up to</Label>
                  <Input id="purchase_manager_limit" type="number" min="0" step="50" value={settings.purchase_manager_limit} onChange={(e) => set("purchase_manager_limit", e.target.value)} className="mt-1 w-full sm:w-40" />
                  <p className="mt-1 text-xs text-muted-foreground">Purchase orders above this need an admin to approve them.</p>
                </div>
                <div>
                  <Label htmlFor="overhead_percent">Overhead on project costs (%)</Label>
                  <Input id="overhead_percent" type="number" min="0" max="100" step="0.5" value={settings.overhead_percent} onChange={(e) => set("overhead_percent", e.target.value)} className="mt-1 w-full sm:w-40" />
                  <p className="mt-1 text-xs text-muted-foreground">Added on top of materials, labour and shipping in profit and loss reports, to cover rent, power and tools.</p>
                </div>
                <div>
                  <Label htmlFor="f-currency">Currency</Label>
                  <Select value={settings.currency} onValueChange={(v) => set("currency", v)}>
                    <SelectTrigger id="f-currency" className="mt-1 w-full sm:w-64"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Enabled invoice currencies</Label>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                    Currencies staff can pick when creating invoices. The base currency is always enabled.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currencies.map((c) => {
                      const isBase = c.value === settings.currency;
                      const isOn = isBase || settings.enabled_currencies?.includes(c.value);
                      return (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => {
                            if (isBase) return;
                            const next = new Set(settings.enabled_currencies ?? []);
                            if (next.has(c.value)) next.delete(c.value);
                            else next.add(c.value);
                            set("enabled_currencies", Array.from(next));
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs border transition ${
                            isOn
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          } ${isBase ? "opacity-80 cursor-not-allowed" : ""}`}
                        >
                          {c.value}{isBase ? " • base" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Monthly Revenue Goal</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set a revenue target each month. Once set, it locks for that month so progress tracking stays honest — you can set a new goal when the next month starts.
                    </p>
                  </div>
                  {!goalsEnabled && (
                    <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                      Goal controls are unavailable while the Goals feature is disabled.
                    </p>
                  )}
                  {goalsEnabled && (() => {
                    const now = new Date();
                    const label = now.toLocaleString("default", { month: "long", year: "numeric" });
                    if (currentMonthGoal === undefined) {
                      return <p className="text-sm text-muted-foreground">Loading...</p>;
                    }
                    if (currentMonthGoal !== null) {
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{label}:</span>
                          <span className="text-sm">{settings.currency} {currentMonthGoal.toLocaleString()}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                            <Lock className="h-3 w-3" /> Locked
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min="0" step="100"
                          value={goalInput}
                          onChange={(e) => setGoalInput(e.target.value)}
                          placeholder={`Set goal for ${label}`}
                          className="w-full sm:w-48"
                        />
                        <Button size="sm" onClick={handleSetGoal} disabled={settingGoal}>
                          {settingGoal ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set Goal"}
                        </Button>
                      </div>
                    );
                  })()}
                  {goalsEnabled && pastGoals.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Past goals</p>
                      <div className="border rounded-md divide-y text-sm">
                        {pastGoals.map((g) => (
                          <div key={`${g.year}-${g.month}`} className="flex justify-between px-3 py-1.5">
                            <span className="text-muted-foreground">
                              {new Date(g.year, g.month - 1).toLocaleString("default", { month: "long", year: "numeric" })}
                            </span>
                            <span className="font-medium">{settings.currency} {Number(g.goal_amount).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="mt-0 max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle>In-app Notifications</CardTitle>
                <CardDescription>Choose which events create in-app notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Project status changes</p>
                    <p className="text-xs text-muted-foreground">Notify client and staff when a project status changes</p>
                  </div>
                  <Switch checked={settings.notify_job_status} onCheckedChange={(v) => set("notify_job_status", v)} />
                </div>
                {appointmentsEnabled && <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">New appointments</p>
                    <p className="text-xs text-muted-foreground">Notify admin when a client books an appointment</p>
                  </div>
                  <Switch checked={settings.notify_new_appointment} onCheckedChange={(v) => set("notify_new_appointment", v)} />
                </div>}
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

          <TabsContent value="branding" className="mt-0 max-w-3xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Workshop Logo</CardTitle>
                <CardDescription>Upload a square logo for the login page. Recommended: 512×512 px PNG with transparent background. Minimum 128×128 px.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative inline-block rounded-lg overflow-hidden border">
                  <img src={resolveLogoUrl(settings.logo_url)} alt="Workshop logo" className="w-24 h-24 object-contain" onError={useDefaultLogoOnError} />
                  {customLogoUrl && (
                    <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6" onClick={handleRemoveLogo}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {!customLogoUrl && (
                  <p className="text-sm text-muted-foreground">No custom logo set. The default Shoplane logo will be shown.</p>
                )}
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadLogo} />
                <Button variant="outline" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" />{uploadingLogo ? "Uploading..." : "Upload Logo"}
                </Button>
              </CardContent>
            </Card>
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
            <Card>
              <CardHeader>
                <CardTitle>Brand Colors</CardTitle>
                <CardDescription>Customize the app's primary and accent colors to match your brand. Changes preview live and apply to everyone once saved.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(["primary", "accent"] as const).map((kind) => {
                  const field = kind === "primary" ? "brand_primary_hsl" : "brand_accent_hsl";
                  const current = (settings as any)[field] as string;
                  const hex = current ? hslStringToHex(current) ?? "" : (kind === "primary" ? hslStringToHex(DEFAULT_BRAND.primary)! : hslStringToHex(DEFAULT_BRAND.accent)!);
                  return (
                    <div key={kind} className="space-y-2">
                      <Label className="capitalize">{kind} color</Label>
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={hex}
                          onChange={(e) => {
                            const hsl = hexToHslString(e.target.value);
                            if (!hsl) return;
                            set(field as any, hsl);
                            applyBrandColors({
                              primary: kind === "primary" ? hsl : settings.brand_primary_hsl || null,
                              accent: kind === "accent" ? hsl : settings.brand_accent_hsl || null,
                            });
                          }}
                          className="h-10 w-14 cursor-pointer rounded border bg-transparent"
                        />
                        <Input
                          value={hex}
                          onChange={(e) => {
                            const hsl = hexToHslString(e.target.value);
                            if (!hsl) return;
                            set(field as any, hsl);
                            applyBrandColors({
                              primary: kind === "primary" ? hsl : settings.brand_primary_hsl || null,
                              accent: kind === "accent" ? hsl : settings.brand_accent_hsl || null,
                            });
                          }}
                          className="max-w-[140px] font-mono text-xs"
                          placeholder="#2e6a4c"
                        />
                        <div className="flex flex-wrap gap-2">
                          {PRESETS.map((p) => (
                            <button
                              key={p.name}
                              type="button"
                              title={p.name}
                              aria-label={`Use ${p.name} as ${kind} colour`}
                              onClick={() => {
                                const hsl = hexToHslString(p.hex)!;
                                set(field as any, hsl);
                                applyBrandColors({
                                  primary: kind === "primary" ? hsl : settings.brand_primary_hsl || null,
                                  accent: kind === "accent" ? hsl : settings.brand_accent_hsl || null,
                                });
                              }}
                              className="h-7 w-7 rounded-full border-2 border-border hover:scale-110 transition-transform"
                              style={{ background: p.hex }}
                            />
                          ))}
                        </div>
                      </div>
                      {kind === "primary" && current && (contrastWithWhite(current) ?? 5) < 4.5 && (() => {
                        const readable = ensureReadablePrimary(current);
                        return (
                          <p className="flex flex-wrap items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                            This colour is too light for white text. Buttons and links will use a darker shade so they stay readable:
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                              <span aria-hidden className="h-4 w-4 rounded border" style={{ background: hslStringToHex(readable) ?? undefined }} />
                              {hslStringToHex(readable)}
                            </span>
                          </p>
                        );
                      })()}
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      set("brand_primary_hsl" as any, "");
                      set("brand_accent_hsl" as any, "");
                      applyBrandColors({ primary: null, accent: null });
                      toast.info("Reset to default — remember to save");
                    }}
                  >
                    Reset to default
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email" className="mt-0 max-w-3xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Notifications</CardTitle>
                <CardDescription>Send emails for key events via Resend. Requires a Resend API key configured as a Supabase secret.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Enable email notifications</p>
                    <p className="text-xs text-muted-foreground">Send emails for project updates, quotes and appointments</p>
                  </div>
                  <Switch checked={settings.email_notifications_enabled} onCheckedChange={(v) => set("email_notifications_enabled", v)} />
                </div>
                <div>
                  <Label htmlFor="from_email">From Email Address</Label>
                  <Input id="from_email" type="email" value={settings.from_email} onChange={(e) => set("from_email", e.target.value)} placeholder="noreply@yourworkshop.com" className="mt-1" disabled={!settings.email_notifications_enabled} />
                  <p className="text-xs text-muted-foreground mt-1">Must be a verified sender domain in Resend</p>
                </div>
                <div>
                  <Label htmlFor="super_admin_email">Platform Support Email</Label>
                  <Input id="super_admin_email" type="email" value={settings.super_admin_email} onChange={(e) => set("super_admin_email", e.target.value)} placeholder="admin@example.com" className="mt-1" />
                  <p className="text-xs text-muted-foreground mt-1">Issue reports from users will be sent to this address</p>
                </div>
                <div className="pt-2 border-t space-y-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestEmail}
                    disabled={testingEmail}
                    className="gap-2"
                  >
                    {testingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {testingEmail ? "Sending..." : "Send Test Email"}
                  </Button>
                  {emailTestResult && (
                    <Alert variant={emailTestResult.ok ? "default" : "destructive"}>
                      <AlertDescription className="text-xs">{emailTestResult.message}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="mt-0 max-w-4xl space-y-4">
            <SectionHeading title="Accounting" description="Send invoices to QuickBooks, Xero or any other finance system, and get payments back." />
            {activeTab === "integrations" && (accountingEnabled
              ? <IntegrationsPanel />
              : <p className="text-sm text-muted-foreground">Accounting sync isn't switched on for your workshop. Contact Shoplane support to add it.</p>)}
          </TabsContent>

          <TabsContent value="data" className="mt-0 max-w-3xl space-y-4">
            <SectionHeading title="Demo and testing" description="Only shown where demo tools are enabled." />
            {canSetupDemoUsers && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Setup Demo Users</CardTitle>
                <CardDescription>Create or reset one demo account for each role so the one-click demo page can sign in.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleSetupDemo} disabled={settingUpDemo} variant="outline">
                  {settingUpDemo ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Setting up...</> : <><Users className="mr-2 h-4 w-4" />Setup Demo Users</>}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Existing demo passwords and roles are reset to match the credentials used by <span className="font-mono">/demo</span>.
                </p>
              </CardContent>
            </Card>
            )}
            {canGenerateSampleData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />Generate Sample Data</CardTitle>
                <CardDescription>Populate the database with realistic sample data for testing.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleSeedData} disabled={seeding}>
                  {seeding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Database className="mr-2 h-4 w-4" />Generate Sample Data</>}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Creates ~50+ records across all tables.
                </p>
              </CardContent>
            </Card>
            )}
            {canBackupRestore && (
            <>
            <SectionHeading title="Backups" description="Keep a copy of your data somewhere safe, and restore it if something goes wrong." />
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Create Backup</CardTitle>
                <CardDescription>Export all workshop data to a JSON file you can store securely and restore later.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleBackup} disabled={backing} variant="outline">
                  {backing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating backup...</> : <><Download className="mr-2 h-4 w-4" />Download Backup</>}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">Includes projects, requests, quotes, tasks, time, stock, purchasing, shipping, invoices, teams and access, and settings. Rate limited to 5 per hour.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Restore from Backup</CardTitle>
                <CardDescription>Overwrite current data with a previously downloaded backup file. It is all or nothing: if the file doesn't fit this workshop, nothing changes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleRestoreFileChange}
                />
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => backupFileInputRef.current?.click()} disabled={restoring}>
                    <Upload className="mr-2 h-4 w-4" />Choose Backup File
                  </Button>
                  {restoreFile && <span className="text-sm text-muted-foreground">{restoreFile.name}</span>}
                </div>
                {restoreFile && (
                  <Dialog open={restoreDialogOpen} onOpenChange={(open) => { setRestoreDialogOpen(open); if (!open) setRestoreConfirmText(""); }}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" disabled={restoring}>
                        {restoring ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Restoring...</> : "Restore"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-destructive">Restore from Backup</DialogTitle>
                        <DialogDescription>
                          This will overwrite <strong>all current business data</strong> with the contents of <strong>{restoreFile.name}</strong>. User accounts are preserved. This action cannot be undone.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-2">
                        <Label htmlFor="f-type-restore-to-confirm">Type <span className="font-mono font-bold">RESTORE</span> to confirm</Label>
                        <Input id="f-type-restore-to-confirm" value={restoreConfirmText} onChange={(e) => setRestoreConfirmText(e.target.value)} placeholder="RESTORE" />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setRestoreDialogOpen(false); setRestoreConfirmText(""); }}>Cancel</Button>
                        <Button variant="destructive" disabled={restoreConfirmText !== "RESTORE" || restoring} onClick={handleRestore}>
                          Confirm Restore
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
                <p className="text-xs text-muted-foreground">Only backups from this application are accepted. The file checksum is verified before any data is changed.</p>
              </CardContent>
            </Card>
            </>
            )}
            <SectionHeading title="Danger zone" description="These permanently delete data. Take a backup first." danger />
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" />Delete All Data</CardTitle>
                <CardDescription>Remove all projects, stock and billing data. User accounts, teams and access, and settings are kept.</CardDescription>
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
                      <AlertDialogDescription>This will permanently delete all projects and requests with their quotes, tasks, time and shipments; stock items, suppliers and purchase orders; invoices; appointments; and notifications. Project IDs start again from 001. This action cannot be undone.</AlertDialogDescription>
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
            <Card className="border-destructive bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Factory Reset</CardTitle>
                <CardDescription>Completely wipe this environment — deletes <strong>all data AND all user accounts</strong> except yours. Use this to start fresh.</CardDescription>
              </CardHeader>
              <CardContent>
                <Dialog open={resetDialogOpen} onOpenChange={(open) => { setResetDialogOpen(open); if (!open) setResetConfirmText(""); }}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" disabled={resetting}>
                      {resetting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting...</> : <><AlertTriangle className="mr-2 h-4 w-4" />Factory Reset</>}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-destructive">⚠️ Factory Reset</DialogTitle>
                      <DialogDescription>
                        This will permanently delete <strong>all business data</strong>, <strong>all user accounts</strong> (except yours), <strong>all activity logs</strong>, <strong>all teams and access</strong>, and <strong>reset all settings to defaults</strong>. This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="f-type-reset-to-confirm">Type <span className="font-mono font-bold">RESET</span> to confirm</Label>
                      <Input id="f-type-reset-to-confirm" value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder="RESET" />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => { setResetDialogOpen(false); setResetConfirmText(""); }}>Cancel</Button>
                      <Button variant="destructive" disabled={resetConfirmText !== "RESET" || resetting} onClick={handleFactoryReset}>
                        {resetting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting...</> : "Confirm Factory Reset"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <p className="text-xs text-muted-foreground mt-2">Your admin account will be preserved. Everything else will be deleted.</p>
              </CardContent>
            </Card>
          </TabsContent>
          </div>
        </Tabs>
      </div>

      {(isDirty || saving) && (
        <div
          role="region"
          aria-label="Unsaved changes"
          className={cn("fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom,0px))] z-30 border-t bg-card md:bottom-0", sidebarState === "collapsed" ? "md:left-[var(--sidebar-width-icon)]" : "md:left-[var(--sidebar-width)]")}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-medium">You have unsaved changes</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={saving} onClick={() => savedSnapshot && setSettings(JSON.parse(savedSnapshot))}>
                Discard
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

const SETTINGS_SECTIONS = [
  { value: "general", label: "General", hint: "Name, contact details", icon: Building2 },
  { value: "billing", label: "Billing", hint: "Currency, tax, invoices", icon: Receipt },
  { value: "notifications", label: "Notifications", hint: "In-app alerts", icon: Bell },
  { value: "branding", label: "Branding", hint: "Logo, colours, sign-in image", icon: Palette },
  { value: "email", label: "Email", hint: "Delivery and test sends", icon: Mail },
  { value: "integrations", label: "Integrations", hint: "QuickBooks, Xero, webhooks", icon: Plug },
  { value: "data", label: "Data", hint: "Backups, demo, reset", icon: Database },
] as const;

function SectionHeading({ title, description, danger }: { title: string; description: string; danger?: boolean }) {
  return (
    <div className="pt-2">
      <h2 className={cn("font-sans text-base font-semibold", danger && "text-destructive")}>{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
