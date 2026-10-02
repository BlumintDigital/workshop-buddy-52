// Vehicle, VIN and address lookups for the team.
//
// POST { action: "status" }                              → which lookups this workshop has
// POST { action: "vehicle", registration }               → UK registration (Zyfy: DVLA + DVSA data)
// POST { action: "vin", vin }                            → VIN decode (NHTSA vPIC, free; best for US/Canada)
// POST { action: "address", query, country? }            → address suggestions (Geoapify worldwide,
//                                                          or postcodes.io for a full UK postcode)
//
// Provider keys are edge function secrets that Shoplane Control copies in (ZYFY_API_KEY,
// GEOAPIFY_API_KEY); without one, that lookup reports itself unavailable and the app hides it.
// Results are cached in public.lookup_cache (vehicles 30 days, VINs a year, addresses 7 days).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { LookupError, normaliseGeoapify, normaliseNhtsa, normalisePostcodesIo, normaliseZyfy, type AddressResult, type VehicleResult, type VinResult } from "./normalise.ts";

const DAY = 86_400_000;
const TTL: Record<string, number> = { vehicle: 30 * DAY, vin: 365 * DAY, address: 7 * DAY };
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const UK_REG = /^[A-Z0-9]{2,8}$/;
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

async function zyfyVehicle(registration: string): Promise<VehicleResult | null> {
  const key = Deno.env.get("ZYFY_API_KEY");
  if (!key) throw new LookupError("Vehicle lookup isn't set up for this workshop.", 409);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://zyfy.uk/v1/vehicle/${encodeURIComponent(registration)}`, { headers: { "X-Api-Key": key, Accept: "application/json" } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 404 || body?.error === "not_found") return null;
    if (res.status === 400) throw new LookupError("That doesn't look like a UK registration.");
    if (res.status === 401 || res.status === 403) {
      await captureEdgeError(new Error(`Zyfy refused the key (${res.status})`), "lookup");
      throw new LookupError("Vehicle lookup isn't working right now. Enter the details by hand.", 502);
    }
    if (res.status === 429) throw new LookupError("This month's vehicle lookups have been used up. Enter the details by hand.", 429);
    if (!res.ok) throw new LookupError("Vehicle lookup isn't answering. Try again in a minute.", 502);
    // A plate the provider hasn't seen before comes back while it's still gathering the data.
    if (res.status === 202 || body?.enrichmentPending) {
      const wait = Math.min(Number(res.headers.get("Retry-After") ?? 2) || 2, 4);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    return normaliseZyfy(body, registration);
  }
  throw new LookupError("The vehicle's record is still being gathered. Try again in a few seconds.", 503);
}

async function nhtsaVin(vin: string): Promise<VinResult | null> {
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
  if (!res.ok) throw new LookupError("VIN decoding isn't answering. Try again in a minute.", 502);
  return normaliseNhtsa(await res.json(), vin);
}

async function geoapify(query: string, country: string | null): Promise<AddressResult[]> {
  const params = new URLSearchParams({ text: query, format: "json", limit: "6", apiKey: Deno.env.get("GEOAPIFY_API_KEY")! });
  if (country) params.set("bias", `countrycode:${country}`);
  const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`);
  if (res.status === 401 || res.status === 403) {
    await captureEdgeError(new Error(`Geoapify refused the key (${res.status})`), "lookup");
    throw new LookupError("Address search isn't working right now. Type the address by hand.", 502);
  }
  if (res.status === 429) throw new LookupError("Address search is busy. Type the address by hand.", 429);
  if (!res.ok) throw new LookupError("Address search isn't answering. Try again in a minute.", 502);
  return normaliseGeoapify(await res.json());
}

/** Free and keyless, UK only: a full postcode gives the town and county (not the street). */
async function postcodesIo(postcode: string): Promise<AddressResult[]> {
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new LookupError("Postcode lookup isn't answering. Try again in a minute.", 502);
  return normalisePostcodesIo(await res.json());
}

Deno.serve(async (req) => {
  const cors = { ...buildCorsHeaders(req), "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sign in again." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: claims } = await asUser.auth.getClaims(authHeader.slice(7));
    const uid = claims?.claims?.sub as string | undefined;
    if (!uid) return json({ error: "Sign in again." }, 401);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).in("role", ["admin", "manager", "staff"]).limit(1).maybeSingle();
    if (!roleRow) return json({ error: "Lookups are for the workshop team." }, 403);
    if (!(await sessionVerified(authHeader))) return json({ error: MFA_REQUIRED }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "status") {
      return json({ vehicle: !!Deno.env.get("ZYFY_API_KEY"), vin: true, address_search: !!Deno.env.get("GEOAPIFY_API_KEY"), uk_postcode: true });
    }
    if (!["vehicle", "vin", "address"].includes(action)) return json({ error: "Unknown lookup" }, 400);

    let key: string;
    let fetcher: () => Promise<unknown>;
    if (action === "vehicle") {
      key = String(body.registration ?? "").replace(/\s+/g, "").toUpperCase();
      if (!UK_REG.test(key)) return json({ error: "Enter a UK registration, for example AB12 CDE." }, 400);
      fetcher = () => zyfyVehicle(key);
    } else if (action === "vin") {
      key = String(body.vin ?? "").replace(/\s+/g, "").toUpperCase();
      if (!VIN.test(key)) return json({ error: "A VIN is 17 letters and numbers (no I, O or Q)." }, 400);
      fetcher = () => nhtsaVin(key);
    } else {
      const query = String(body.query ?? "").trim().slice(0, 200);
      const country = /^[a-z]{2}$/i.test(String(body.country ?? "")) ? String(body.country).toLowerCase() : null;
      const usePostcodes = !Deno.env.get("GEOAPIFY_API_KEY");
      if (query.length < 3 || (usePostcodes && !UK_POSTCODE.test(query))) return json({ results: [] });
      key = `${usePostcodes ? "pc" : "geo"}:${country ?? ""}:${query.toLowerCase().replace(/\s+/g, " ")}`;
      fetcher = () => (usePostcodes ? postcodesIo(query) : geoapify(query, country));
    }

    const { data: cached } = await admin.from("lookup_cache").select("result, fetched_at").eq("kind", action).eq("key", key).maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL[action]) {
      return json(action === "address" ? { results: cached.result ?? [] } : { result: cached.result, cached: true });
    }

    // Address search runs as people type, so only paid-for lookups count towards the limit.
    if (action !== "address") {
      const limit = await checkRateLimit(uid, "lookup", { limit: 60, windowSec: 3600, lockoutSec: 900 });
      if (!limit.allowed) return json({ error: "That's a lot of lookups in a short time. Try again in a few minutes." }, 429);
    }

    const result = await fetcher();
    // "Not found" is remembered too (as null) so a mistyped plate doesn't keep costing lookups.
    await admin.from("lookup_cache").upsert({ kind: action, key, result: result ?? null, fetched_at: new Date().toISOString() });
    return json(action === "address" ? { results: result } : { result });
  } catch (e) {
    if (e instanceof LookupError) return json({ error: e.message }, e.status);
    await captureEdgeError(e, "lookup");
    return json({ error: "The lookup didn't work. Enter the details by hand." }, 500);
  }
});
