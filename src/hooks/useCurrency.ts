import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null = null;
const listeners = new Set<(c: string) => void>();
let inflight: Promise<string> | null = null;

async function loadCurrency(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = supabase
    .from("workshop_settings")
    .select("currency")
    .eq("id", 1)
    .maybeSingle()
    .then(({ data }) => {
      const c = ((data as any)?.currency as string | undefined) || "USD";
      cached = c;
      listeners.forEach((fn) => fn(c));
      return c;
    });
  return inflight;
}

export function useCurrency(): { currency: string; format: (n: number) => string } {
  const [currency, setCurrency] = useState<string>(cached ?? "USD");

  useEffect(() => {
    const fn = (c: string) => setCurrency(c);
    listeners.add(fn);
    loadCurrency().then(fn);

    const channel = supabase
      .channel("workshop_settings_currency")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workshop_settings", filter: "id=eq.1" },
        (payload) => {
          const c = (payload.new as any)?.currency as string | undefined;
          if (c && c !== cached) {
            cached = c;
            listeners.forEach((l) => l(c));
          }
        },
      )
      .subscribe();

    return () => {
      listeners.delete(fn);
      supabase.removeChannel(channel);
    };
  }, []);

  const format = (n: number) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
      }).format(Number.isFinite(n) ? n : 0);
    } catch {
      return `${currency} ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
    }
  };

  return { currency, format };
}
