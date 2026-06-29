import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/currencies";

interface CurrencyState {
  currency: string;
  enabled: string[];
}

let cached: CurrencyState | null = null;
const listeners = new Set<(s: CurrencyState) => void>();
let inflight: Promise<CurrencyState> | null = null;

async function loadCurrency(): Promise<CurrencyState> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase
      .from("workshop_settings")
      .select("currency, enabled_currencies")
      .eq("id", 1)
      .maybeSingle();
    const currency = ((data as any)?.currency as string | undefined) || "USD";
    const enabledRaw = ((data as any)?.enabled_currencies as string[] | undefined) || [];
    const enabled = enabledRaw.length ? Array.from(new Set([currency, ...enabledRaw])) : [currency];
    const state: CurrencyState = { currency, enabled };
    cached = state;
    listeners.forEach((fn) => fn(state));
    return state;
  })();
  return inflight;
}

export function useCurrency(): {
  currency: string;
  enabled: string[];
  format: (n: number, code?: string) => string;
} {
  const [state, setState] = useState<CurrencyState>(cached ?? { currency: "USD", enabled: ["USD"] });

  useEffect(() => {
    const fn = (s: CurrencyState) => setState(s);
    listeners.add(fn);
    loadCurrency().then(fn);

    const channel = supabase
      .channel(`workshop_settings_currency_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workshop_settings", filter: "id=eq.1" },
        (payload) => {
          const row = payload.new as any;
          const currency = (row?.currency as string | undefined) || "USD";
          const enabledRaw = (row?.enabled_currencies as string[] | undefined) || [];
          const enabled = enabledRaw.length ? Array.from(new Set([currency, ...enabledRaw])) : [currency];
          const next: CurrencyState = { currency, enabled };
          if (!cached || cached.currency !== next.currency || cached.enabled.join("|") !== next.enabled.join("|")) {
            cached = next;
            listeners.forEach((l) => l(next));
          }
        },
      )
      .subscribe();

    return () => {
      listeners.delete(fn);
      supabase.removeChannel(channel);
    };
  }, []);

  const format = (n: number, code?: string) => formatMoney(n, code || state.currency);

  return { currency: state.currency, enabled: state.enabled, format };
}
