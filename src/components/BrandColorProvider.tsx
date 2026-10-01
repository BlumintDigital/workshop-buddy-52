import { useEffect } from "react";
import { applyBrandColors } from "@/lib/brand-colors";
import { useWorkshopSettings, WorkshopSettingsSync } from "@/hooks/useWorkshopSettings";

/**
 * Applies the workshop's brand colours as CSS variables from the shared settings, and mounts the
 * single realtime subscription that keeps those settings live.
 */
export function BrandColorProvider({ children }: { children: React.ReactNode }) {
  const { data } = useWorkshopSettings();

  useEffect(() => {
    // Only admins and managers can read the brand colours; everyone else keeps the default theme.
    if (data?.source !== "full") return;
    applyBrandColors({ primary: data.brand_primary_hsl, accent: data.brand_accent_hsl });
  }, [data?.source, data?.brand_primary_hsl, data?.brand_accent_hsl]);

  return (
    <>
      <WorkshopSettingsSync />
      {children}
    </>
  );
}
