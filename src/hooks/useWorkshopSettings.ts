import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type WorkshopSettings = {
  workshop_name: string | null;
  logo_url: string | null;
  currency: string;
  enabled_currencies: string[];
  address: string | null;
  phone: string | null;
  contact_email: string | null;
  brand_primary_hsl: string | null;
  brand_accent_hsl: string | null;
  /** "full" when the caller can read workshop_settings (admins, managers); "public" for everyone else. */
  source: "full" | "public";
};

export const WORKSHOP_SETTINGS_KEY = ["workshop-settings"] as const;

const FULL_COLUMNS =
  "workshop_name, logo_url, currency, enabled_currencies, address, phone, contact_email, brand_primary_hsl, brand_accent_hsl";

async function fetchWorkshopSettings(signedIn: boolean): Promise<WorkshopSettings> {
  // Admins and managers can read the table; skip the attempt for signed-out visitors.
  const { data } = signedIn
    ? await (supabase.from("workshop_settings") as any).select(FULL_COLUMNS).eq("id", 1).maybeSingle()
    : { data: null };
  if (data) {
    return {
      workshop_name: data.workshop_name ?? null,
      logo_url: data.logo_url ?? null,
      currency: data.currency || "USD",
      enabled_currencies: data.enabled_currencies || [],
      address: data.address ?? null,
      phone: data.phone ?? null,
      contact_email: data.contact_email ?? null,
      brand_primary_hsl: data.brand_primary_hsl ?? null,
      brand_accent_hsl: data.brand_accent_hsl ?? null,
      source: "full",
    };
  }
  // Staff, clients and signed-out visitors read the public view: the workshop's branding, plus its
  // contact details for anyone signed in (see get_public_workshop_settings).
  const { data: pub } = await supabase
    .from("workshop_settings_public")
    .select("workshop_name, logo_url, currency, enabled_currencies, address, phone, contact_email, brand_primary_hsl, brand_accent_hsl")
    .eq("id", 1)
    .maybeSingle();
  return {
    workshop_name: pub?.workshop_name ?? null,
    logo_url: pub?.logo_url ?? null,
    currency: pub?.currency || "USD",
    enabled_currencies: pub?.enabled_currencies ?? [],
    address: pub?.address ?? null,
    phone: pub?.phone ?? null,
    contact_email: pub?.contact_email ?? null,
    brand_primary_hsl: pub?.brand_primary_hsl ?? null,
    brand_accent_hsl: pub?.brand_accent_hsl ?? null,
    source: "public",
  };
}

/**
 * The workshop's settings row, fetched once per signed-in user and shared by every consumer
 * (sidebar, currency formatting, brand colours, invoice details). Kept live by WorkshopSettingsSync.
 */
export function useWorkshopSettings() {
  const { user, role } = useAuth();
  const ready = useSessionReady();
  return useQuery({
    queryKey: [...WORKSHOP_SETTINGS_KEY, user?.id ?? "signed-out", role ?? "no-role"],
    queryFn: () => fetchWorkshopSettings(!!user),
    // Signed-out pages get the workshop's branding too (colours on the sign-in page).
    enabled: ready,
    staleTime: Infinity,
  });
}

/**
 * True once sign-in has fully settled, including the 2FA step. Admins and managers can't read
 * workshop_settings until their session reaches aal2, so reading earlier would cache an empty row.
 */
function useSessionReady() {
  const { loading, mfaCheckPending, needsMfaVerification } = useAuth();
  return !loading && !mfaCheckPending && !needsMfaVerification;
}

/**
 * Mount once inside AuthProvider. Holds the app's single realtime subscription to workshop_settings,
 * and clears cached data when the signed-in user changes so nothing carries over between accounts.
 */
export function WorkshopSettingsSync() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ready = useSessionReady();
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const id = user?.id ?? null;
    if (lastUserId.current !== undefined && lastUserId.current !== id) queryClient.clear();
    lastUserId.current = id;
  }, [user?.id, queryClient]);

  useEffect(() => {
    // Subscribe only once the session is verified; realtime applies the same RLS as reads.
    if (!user || !ready) return;
    const channel = supabase
      .channel("workshop-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "workshop_settings" }, () => {
        void queryClient.invalidateQueries({ queryKey: WORKSHOP_SETTINGS_KEY });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, ready, queryClient]);

  return null;
}
