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
    // Every role and the sign-in page get the workshop's colours (via the public view if needed).
    if (!data) return;
    applyBrandColors({ primary: data.brand_primary_hsl, accent: data.brand_accent_hsl });
  }, [data]);

  return (
    <>
      <WorkshopSettingsSync />
      {children}
    </>
  );
}
