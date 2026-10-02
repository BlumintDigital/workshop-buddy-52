import { describe, expect, it } from "vitest";
import { normaliseGeoapify, normaliseNhtsa, normalisePostcodesIo, normaliseZyfy } from "../../supabase/functions/lookup/normalise";
import { describeMotHistory, describeVehicle, formatAddress, vehicleMakeModel } from "@/lib/lookup";
import zyfy from "./fixtures/zyfy-vehicle.json";

describe("vehicle lookup (Zyfy)", () => {
  const v = normaliseZyfy(zyfy, "KS69LYH");

  it("reads identity from the top level and MOT, tax and mileage from signals", () => {
    expect(v).toMatchObject({
      registration: "KS69LYH", make: "Vauxhall", model: "Insignia", colour: "Blue", fuel: "Diesel",
      year: 2019, engine_cc: 1956, first_registered: "2019-11",
      mot_status: "valid", mot_expiry: "2027-09-21", tax_status: "taxed", tax_due: "2027-02-01", mileage: 115001,
      mot_failure_areas: ["suspension", "tyres"], mot_advisory_areas: ["brakes", "tyres", "lights"],
    });
  });

  it("describes it in a line reception can read", () => {
    expect(vehicleMakeModel(v)).toBe("Vauxhall Insignia");
    expect(describeVehicle(v)).toMatch(/^Blue · Diesel · 2019 · 1,956 cc · MOT until .*2027$/);
    expect(describeMotHistory(v)).toBe("Past MOT failures: suspension, tyres · Advisories: brakes, tyres, lights");
  });

  it("keeps short brand names in capitals and copes with missing fields", () => {
    const bmw = normaliseZyfy({ make: "BMW", model: "320D M SPORT" }, "AB12CDE");
    expect(bmw.make).toBe("BMW");
    expect(bmw.model).toBe("320d M Sport");
    expect(bmw.mot_expiry).toBeNull();
    expect(bmw.mot_failure_areas).toEqual([]);
    expect(describeMotHistory(bmw)).toBeNull();
  });
});

describe("VIN decode (NHTSA)", () => {
  it("reads make, model and year, and returns nothing for an undecodable VIN", () => {
    const r = normaliseNhtsa({ Results: [{ Make: "FORD", Model: "F-150", ModelYear: "2021", BodyClass: "Pickup", FuelTypePrimary: "Gasoline" }] }, "1FTFW1E50MFA00000");
    expect(r).toEqual({ vin: "1FTFW1E50MFA00000", make: "Ford", model: "F-150", year: 2021, body: "Pickup", fuel: "Gasoline" });
    expect(normaliseNhtsa({ Results: [{ Make: "" }] }, "X")).toBeNull();
  });
});

describe("address lookup", () => {
  it("turns Geoapify results into addresses and doesn't repeat the city as the street", () => {
    const [street, town] = normaliseGeoapify({
      results: [
        { housenumber: "350", street: "5th Avenue", city: "New York", state: "New York", postcode: "10118", country: "United States", country_code: "us", formatted: "350 5th Avenue, New York, NY 10118, United States of America" },
        { address_line1: "Toronto", city: "Toronto", state: "Ontario", country: "Canada", country_code: "ca" },
      ],
    });
    expect(street).toMatchObject({ line1: "350 5th Avenue", city: "New York", region: "New York", postcode: "10118", country_code: "US" });
    expect(town.line1).toBe("");
    expect(formatAddress(street, "us")).toBe("350 5th Avenue, New York, New York, 10118");
    expect(formatAddress(street, "gb")).toBe("350 5th Avenue, New York, New York, 10118, United States");
  });

  it("fills in the town and county from a UK postcode, keeping what was typed", () => {
    const [pc] = normalisePostcodesIo({ result: { postcode: "SW1A 2AA", admin_district: "Westminster", region: "London", country: "England" } });
    expect(pc).toMatchObject({ line1: "", city: "Westminster", region: "London", postcode: "SW1A 2AA", country_code: "GB" });
    expect(formatAddress(pc, "gb", "10 Downing Street")).toBe("10 Downing Street, Westminster, London, SW1A 2AA");
    expect(normalisePostcodesIo({ result: null })).toEqual([]);
  });
});
