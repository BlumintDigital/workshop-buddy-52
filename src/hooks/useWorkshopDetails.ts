import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkshopDetails } from "@/lib/invoicePdf";

/**
 * Subscribe to the singleton row in `workshop_settings` so that any admin edit
 * to company details (name, address, phone, email, logo) propagates live to
 * every consumer (invoice form, PDF preview, etc.).
 */
export function useWorkshopDetails() {
  const [workshop, setWorkshop] = useState<WorkshopDetails | undefined>(undefined);
  const [currency, setCurrency] = useState<string>("USD");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      const { data } = await supabase
        .from("workshop_settings")
        .select("workshop_name, address, phone, contact_email, logo_url, currency")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setWorkshop({
          workshop_name: data.workshop_name,
          address: (data as any).address,
          phone: (data as any).phone,
          contact_email: (data as any).contact_email,
          logo_url: (data as any).logo_url,
        });
        setCurrency((data as any).currency || "USD");
      }
      setLoading(false);
    };

    fetchOnce();

    const channel = supabase
      .channel("workshop_settings_live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workshop_settings", filter: "id=eq.1" },
        () => { void fetchOnce(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { workshop, currency, loading };
}
