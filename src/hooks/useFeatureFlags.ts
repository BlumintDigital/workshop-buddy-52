import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlags = {
  goals: boolean;
  client_portal: boolean;
  reports: boolean;
  appointments: boolean;
};

const DEFAULTS: FeatureFlags = {
  goals: true,
  client_portal: true,
  reports: true,
  appointments: true,
};

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULTS);

  useEffect(() => {
    supabase
      .from("workshop_settings")
      .select("feature_flags")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const raw = (data as any).feature_flags;
        if (raw && typeof raw === "object") {
          setFlags({ ...DEFAULTS, ...raw });
        }
      });
  }, []);

  return flags;
}
