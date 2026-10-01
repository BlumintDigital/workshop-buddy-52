import { formatMoney } from "@/lib/currencies";
import { useWorkshopSettings } from "@/hooks/useWorkshopSettings";

/** The workshop's base currency, the currencies it accepts, and a formatter. Reads the shared settings. */
export function useCurrency(): {
  currency: string;
  enabled: string[];
  format: (n: number, code?: string) => string;
} {
  const { data } = useWorkshopSettings();
  const currency = data?.currency || "USD";
  const enabledRaw = data?.enabled_currencies ?? [];
  const enabled = enabledRaw.length ? Array.from(new Set([currency, ...enabledRaw])) : [currency];
  const format = (n: number, code?: string) => formatMoney(n, code || currency);
  return { currency, enabled, format };
}
