import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type FeatureKey =
  | "appointments"
  | "client_portal"
  | "goals"
  | "reports"
  | "job_chat"
  | "generate_sample_data"
  | "setup_demo_users"
  | "backup_restore";

export type FeatureFlags = Record<FeatureKey, boolean>;

export interface FeatureFlagState {
  flags: FeatureFlags;
  loading: boolean;
  error: Error | null;
}

export const FEATURE_DEFAULTS: FeatureFlags = {
  appointments: true,
  client_portal: true,
  goals: true,
  reports: true,
  job_chat: true,
  generate_sample_data: false,
  setup_demo_users: false,
  backup_restore: false,
};

const FEATURE_KEYS = Object.keys(FEATURE_DEFAULTS) as FeatureKey[];

const FeatureFlagContext = createContext<FeatureFlagState | null>(null);

export function normalizeFeatureFlags(rows: unknown): FeatureFlags {
  const next = { ...FEATURE_DEFAULTS };
  if (!Array.isArray(rows)) return next;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const key = (row as { key?: string }).key as FeatureKey;
    const enabled = (row as { enabled?: unknown }).enabled;
    if (FEATURE_KEYS.includes(key) && typeof enabled === "boolean") {
      next[key] = enabled;
    }
  }
  return next;
}

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<FeatureFlagState>({
    flags: FEATURE_DEFAULTS,
    loading: false,
    error: null,
  });
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setState({ flags: FEATURE_DEFAULTS, loading: false, error: null });
      setLoadedUserId(null);
      return;
    }

    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    const loadFlags = async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("key, enabled");

      if (!active) return;
      if (error) {
        // Fail open so a configuration outage cannot take down core workflows.
        setState({ flags: FEATURE_DEFAULTS, loading: false, error: new Error(error.message) });
        setLoadedUserId(user.id);
        return;
      }

      setState({ flags: normalizeFeatureFlags(data), loading: false, error: null });
      setLoadedUserId(user.id);
    };

    void loadFlags();

    const channel = supabase
      .channel("feature-flags")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feature_flags" },
        () => void loadFlags(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const value = useMemo(
    () => ({
      ...state,
      loading: state.loading || (!!user && loadedUserId !== user.id),
    }),
    [loadedUserId, state, user],
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlagState {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    console.error("useFeatureFlags called outside FeatureFlagProvider — returning defaults");
    return { flags: FEATURE_DEFAULTS, loading: false, error: null };
  }
  return context;
}

export function useFeature(feature: FeatureKey): boolean {
  return useFeatureFlags().flags[feature];
}

export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const enabled = useFeature(feature);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
