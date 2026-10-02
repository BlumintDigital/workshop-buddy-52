import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkshopSettings } from "@/hooks/useWorkshopSettings";

// Client side of the `lookup` edge function (supabase/functions/lookup). Shapes match
// supabase/functions/lookup/normalise.ts.

export interface VehicleLookup {
  registration: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  fuel: string | null;
  year: number | null;
  engine_cc: number | null;
  first_registered: string | null;
  mot_status: string | null;
  mot_expiry: string | null;
  tax_status: string | null;
  tax_due: string | null;
  mileage: number | null;
  mot_failure_areas?: string[];
  mot_advisory_areas?: string[];
}

export interface VinLookup {
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  body: string | null;
  fuel: string | null;
}

export interface AddressSuggestion {
  label: string;
  line1: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  country_code: string;
}

export interface LookupStatus {
  vehicle: boolean;
  vin: boolean;
  address_search: boolean;
  uk_postcode: boolean;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("lookup", { body });
  if (error) {
    let message = "The lookup didn't work. Enter the details by hand.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        message = (await ctx.json())?.error ?? message;
      } catch {
        /* keep the generic message */
      }
    }
    throw new Error(message);
  }
  return data as T;
}

/** Which lookups this workshop has. Asked once per session; nothing shows if it fails. */
export function useLookupStatus() {
  return useQuery({
    queryKey: ["lookup-status"],
    queryFn: () => call<LookupStatus>({ action: "status" }),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

export const lookupVehicle = (registration: string) => call<{ result: VehicleLookup | null }>({ action: "vehicle", registration }).then((r) => r.result);
export const decodeVin = (vin: string) => call<{ result: VinLookup | null }>({ action: "vin", vin }).then((r) => r.result);
export const searchAddress = (query: string, country: string | null) =>
  call<{ results: AddressSuggestion[] }>({ action: "address", query, country }).then((r) => r.results ?? []);

const CURRENCY_COUNTRY: Record<string, string> = {
  GBP: "gb", USD: "us", CAD: "ca", AUD: "au", NZD: "nz", ZAR: "za", NGN: "ng", KES: "ke", GHS: "gh", INR: "in", AED: "ae", SGD: "sg",
};

/** The workshop's own country, guessed from its currency, so address search prefers local results. */
export function useWorkshopCountry(): string | null {
  const { data } = useWorkshopSettings();
  return data?.currency ? CURRENCY_COUNTRY[data.currency.toUpperCase()] ?? null : null;
}

/** "Past MOT failures: suspension, tyres · Advisories: brakes, tyres, lights", or null. */
export function describeMotHistory(v: VehicleLookup): string | null {
  const f = v.mot_failure_areas ?? [];
  const a = v.mot_advisory_areas ?? [];
  return [f.length ? `Past MOT failures: ${f.join(", ")}` : null, a.length ? `Advisories: ${a.join(", ")}` : null].filter(Boolean).join(" · ") || null;
}

export const vehicleMakeModel = (v: Pick<VehicleLookup, "make" | "model">) => [v.make, v.model].filter(Boolean).join(" ");

/** One line for under the registration: "Silver · Petrol · 2017 · 1,598 cc · MOT until 14 Nov 2026". */
export function describeVehicle(v: VehicleLookup): string {
  const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const mot = v.mot_expiry
    ? `${new Date(`${v.mot_expiry}T00:00:00`) < new Date(new Date().toDateString()) ? "MOT expired" : "MOT until"} ${day(v.mot_expiry)}`
    : v.mot_status && /no|not/i.test(v.mot_status) ? "No MOT on record" : null;
  const tax = v.tax_status === "sorn" ? "SORN" : v.tax_status === "untaxed" ? "Untaxed" : null;
  return [v.colour, v.fuel, v.year, v.engine_cc ? `${v.engine_cc.toLocaleString()} cc` : null, mot, tax].filter(Boolean).join(" · ");
}

/**
 * The full one-line address for a suggestion, as stored in Shoplane. The country is added only
 * when it isn't the workshop's own (`home`, a two-letter code).
 */
export function formatAddress(a: AddressSuggestion, home: string | null, typedBeforePostcode = ""): string {
  const parts = a.line1 ? [a.line1, a.city, a.region, a.postcode] : [typedBeforePostcode, a.city, a.region, a.postcode];
  const country = a.country && a.country_code.toLowerCase() !== (home ?? "").toLowerCase() ? a.country : "";
  return [...parts, country].map((p) => p.trim().replace(/,$/, "")).filter(Boolean).join(", ");
}
