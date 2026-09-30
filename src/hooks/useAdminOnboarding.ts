import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/useFeatureFlags";

export type AdminOnboardingStepId =
  | "workshop_settings"
  | "team_invites"
  | "client"
  | "job"
  | "inventory";

export type AdminOnboardingMetrics = {
  hasWorkshopDetails: boolean;
  teamCount: number;
  inviteCodeCount: number;
  clientCount: number;
  jobCount: number;
  inventoryCount: number;
};

export type AdminOnboardingStep = {
  id: AdminOnboardingStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
  completed: boolean;
  skipped: boolean;
  skippable: boolean;
};

type OnboardingProgress = {
  user_id: string;
  skipped_steps: string[];
  dismissed_at: string | null;
};

const DEFAULT_METRICS: AdminOnboardingMetrics = {
  hasWorkshopDetails: false,
  teamCount: 0,
  inviteCodeCount: 0,
  clientCount: 0,
  jobCount: 0,
  inventoryCount: 0,
};

export const ADMIN_ONBOARDING_STEP_DEFINITIONS: Array<Omit<AdminOnboardingStep, "completed" | "skipped">> = [
  {
    id: "workshop_settings",
    title: "Add workshop details",
    description: "Set your workshop name, contact details, currency, branding, and notification preferences.",
    href: "/admin/settings",
    cta: "Open settings",
    skippable: true,
  },
  {
    id: "team_invites",
    title: "Invite your team",
    description: "Create an invite code or add another staff member so projects can be assigned when you are ready.",
    href: "/admin/signup-codes",
    cta: "Create invite",
    skippable: true,
  },
  {
    id: "client",
    title: "Add your first client",
    description: "Create a client company or contact. Projects can still be created first and linked to a client later.",
    href: "/admin/clients",
    cta: "Add client",
    skippable: true,
  },
  {
    id: "job",
    title: "Create your first project",
    description: "Add a real project or quote. You can leave staff and client unassigned until those records exist.",
    href: "/admin/projects",
    cta: "Create project",
    skippable: true,
  },
  {
    id: "inventory",
    title: "Add inventory items",
    description: "Track stock, reorder points, and low-stock alerts for materials or parts.",
    href: "/inventory/stock",
    cta: "Add inventory",
    skippable: true,
  },
];

export function buildAdminOnboardingSteps(
  metrics: AdminOnboardingMetrics,
  skippedSteps: string[] = [],
  /** Steps for switched-off features are left out. */
  features: { inventory?: boolean } = {},
): AdminOnboardingStep[] {
  const skipped = new Set(skippedSteps);
  const completedByStep: Record<AdminOnboardingStepId, boolean> = {
    workshop_settings: metrics.hasWorkshopDetails,
    team_invites: metrics.teamCount > 1 || metrics.inviteCodeCount > 0,
    client: metrics.clientCount > 0,
    job: metrics.jobCount > 0,
    inventory: metrics.inventoryCount > 0,
  };

  return ADMIN_ONBOARDING_STEP_DEFINITIONS.filter((step) => step.id !== "inventory" || features.inventory !== false).map((step) => ({
    ...step,
    completed: completedByStep[step.id],
    skipped: skipped.has(step.id),
  }));
}

export function useAdminOnboarding() {
  const { user, role } = useAuth();
  const inventoryEnabled = useFeature("inventory");
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [metrics, setMetrics] = useState<AdminOnboardingMetrics>(DEFAULT_METRICS);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    if (!user || role !== "admin") {
      setProgress(null);
      setMetrics(DEFAULT_METRICS);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [
      progressRes,
      settingsRes,
      teamRes,
      inviteRes,
      clientRes,
      jobRes,
      inventoryRes,
    ] = await Promise.all([
      supabase
        .from("admin_onboarding_progress")
        .select("user_id, skipped_steps, dismissed_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("workshop_settings")
        .select("workshop_name, contact_email, phone, address")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .in("role", ["admin", "manager", "staff"]),
      supabase
        .from("signup_codes")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "client"),
      supabase
        .from("jobs")
        .select("*", { count: "exact", head: true }),
      supabase
        .from("inventory_items")
        .select("*", { count: "exact", head: true }),
    ]);

    const settings = settingsRes.data;
    setProgress(progressRes.data ?? null);
    setMetrics({
      hasWorkshopDetails: !!(
        settings?.workshop_name?.trim() ||
        settings?.contact_email?.trim() ||
        settings?.phone?.trim() ||
        settings?.address?.trim()
      ),
      teamCount: teamRes.count ?? 0,
      inviteCodeCount: inviteRes.count ?? 0,
      clientCount: clientRes.count ?? 0,
      jobCount: jobRes.count ?? 0,
      inventoryCount: inventoryRes.count ?? 0,
    });
    setLoading(false);
  }, [role, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const steps = useMemo(
    () => buildAdminOnboardingSteps(metrics, progress?.skipped_steps ?? [], { inventory: inventoryEnabled }),
    [metrics, progress?.skipped_steps, inventoryEnabled],
  );
  const activeSteps = steps.filter((step) => !step.skipped);
  const completedCount = steps.filter((step) => step.completed).length;
  const activeCompletedCount = activeSteps.filter((step) => step.completed).length;
  const dismissed = !!progress?.dismissed_at;

  const saveProgress = useCallback(async (next: Pick<OnboardingProgress, "skipped_steps" | "dismissed_at">) => {
    if (!user || role !== "admin") return;
    setUpdating(true);
    const payload: OnboardingProgress = {
      user_id: user.id,
      skipped_steps: next.skipped_steps,
      dismissed_at: next.dismissed_at,
    };
    const { data, error } = await supabase
      .from("admin_onboarding_progress")
      .upsert(payload, { onConflict: "user_id" })
      .select("user_id, skipped_steps, dismissed_at")
      .single();

    if (!error && data) {
      setProgress(data);
    }
    setUpdating(false);
  }, [role, user]);

  const skipStep = useCallback(async (stepId: AdminOnboardingStepId) => {
    const nextSkipped = Array.from(new Set([...(progress?.skipped_steps ?? []), stepId]));
    await saveProgress({
      skipped_steps: nextSkipped,
      dismissed_at: progress?.dismissed_at ?? null,
    });
  }, [progress?.dismissed_at, progress?.skipped_steps, saveProgress]);

  const dismissOnboarding = useCallback(async () => {
    await saveProgress({
      skipped_steps: progress?.skipped_steps ?? [],
      dismissed_at: new Date().toISOString(),
    });
  }, [progress?.skipped_steps, saveProgress]);

  const resetOnboarding = useCallback(async () => {
    await saveProgress({
      skipped_steps: [],
      dismissed_at: null,
    });
  }, [saveProgress]);

  return {
    steps,
    activeSteps,
    completedCount,
    activeCompletedCount,
    dismissed,
    loading,
    updating,
    skipStep,
    dismissOnboarding,
    resetOnboarding,
    refreshOnboarding: load,
  };
}
