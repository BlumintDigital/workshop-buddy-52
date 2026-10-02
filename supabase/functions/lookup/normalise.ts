// Turns each provider's answer into the shape the app uses. Kept free of Deno APIs so the
// app's unit tests can run it too (src/test/lookup.test.ts).

export interface VehicleResult {
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
  /** Areas the vehicle has failed on, and been given advisories on, at past MOTs (e.g. "tyres"). */
  mot_failure_areas: string[];
  mot_advisory_areas: string[];
}

export interface VinResult {
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  body: string | null;
  fuel: string | null;
}

export interface AddressResult {
  label: string;
  line1: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  country_code: string;
}

export class LookupError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
type Json = Record<string, any>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null;
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 6) : []);
/** "LAND ROVER" → "Land Rover"; leaves short all-capital words (BMW, GTI) alone. */
const tidy = (s: string | null) =>
  s ? s.toLowerCase().split(" ").map((w) => (w.length <= 3 && /^[a-z]+$/.test(w) && s.includes(w.toUpperCase()) && w !== "and" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ") : null;

/** Zyfy groups fields into sections that vary by plan; look in the body and each usual section. */
function field(body: Json, key: string): unknown {
  for (const section of [body, body.identity, body.vehicle, body.signals, body.status, body.mot, body.tax, body.odometer, body.data]) {
    if (section && typeof section === "object" && section[key] !== undefined && section[key] !== null) return section[key];
  }
  return null;
}

export function normaliseZyfy(body: Json, registration: string): VehicleResult {
  return {
    registration: str(field(body, "registration")) ?? registration,
    make: tidy(str(field(body, "make"))),
    model: tidy(str(field(body, "model"))),
    colour: tidy(str(field(body, "colour")) ?? str(field(body, "color"))),
    fuel: tidy(str(field(body, "fuelType"))),
    year: num(field(body, "yearOfManufacture")),
    engine_cc: num(field(body, "engineCapacityCc")) ?? num(field(body, "engineCapacity")),
    first_registered: str(field(body, "monthOfFirstRegistration")),
    mot_status: str(field(body, "motStatus")),
    mot_expiry: str(field(body, "motExpiryDate")),
    tax_status: str(field(body, "taxStatus")),
    tax_due: str(field(body, "taxDueDate")),
    mileage: num(field(body, "latestOdometerMiles")),
    mot_failure_areas: list(field(body, "failureClusters")),
    mot_advisory_areas: list(field(body, "advisoryClusters")),
  };
}

export function normaliseNhtsa(body: Json, vin: string): VinResult | null {
  const r = body?.Results?.[0] ?? {};
  const make = tidy(str(r.Make));
  if (!make) return null;
  return { vin, make, model: str(r.Model), year: num(r.ModelYear), body: str(r.BodyClass), fuel: str(r.FuelTypePrimary) };
}

export function normaliseGeoapify(body: Json): AddressResult[] {
  return (body?.results ?? []).map((a: Json) => {
    const city = str(a.city) ?? str(a.town) ?? str(a.village) ?? str(a.suburb) ?? "";
    const street = [str(a.housenumber), str(a.street)].filter(Boolean).join(" ");
    // address_line1 is the place's own name when there's no street (e.g. "London"); don't repeat the city.
    const line1 = street || (str(a.address_line1) && a.address_line1 !== city ? a.address_line1 : "");
    return {
      label: str(a.formatted) ?? [line1, city, a.postcode].filter(Boolean).join(", "),
      line1,
      city,
      region: str(a.state) ?? str(a.county) ?? "",
      postcode: str(a.postcode) ?? "",
      country: str(a.country) ?? "",
      country_code: (str(a.country_code) ?? "").toUpperCase(),
    };
  });
}

export function normalisePostcodesIo(body: Json): AddressResult[] {
  const r = body?.result;
  if (!r?.postcode) return [];
  const city = str(r.post_town) ?? str(r.admin_district) ?? "";
  const region = str(r.admin_county) ?? str(r.region) ?? str(r.country) ?? "";
  return [{ label: [city, region, r.postcode].filter(Boolean).join(", "), line1: "", city, region, postcode: r.postcode, country: "United Kingdom", country_code: "GB" }];
}
