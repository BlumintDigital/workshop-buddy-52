import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyBrandColors } from "@/lib/brand-colors";

/**
 * Loads brand colors from workshop_settings and applies them as CSS variables.
 * Subscribes to realtime updates so changes propagate live.
 */
export function BrandColorProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data } = await (supabase.from("workshop_settings") as any)
        .select("brand_primary_hsl, brand_accent_hsl")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled || !data) return;
      applyBrandColors({
        primary: (data as any).brand_primary_hsl ?? null,
        accent: (data as any).brand_accent_hsl ?? null,
      });
    };

    load();

    const channel = supabase
      .channel(`workshop_settings_brand_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workshop_settings", filter: "id=eq.1" },
        (payload) => {
          const row: any = payload.new;
          applyBrandColors({
            primary: row?.brand_primary_hsl ?? null,
            accent: row?.brand_accent_hsl ?? null,
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return <>{children}</>;
}
