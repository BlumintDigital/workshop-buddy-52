import { describe, expect, it } from "vitest";
import { checkRows, mapHeaders, normaliseDate, parseCsv, templateFor, toCsv } from "@/lib/csvImport";
import { INDUSTRIES } from "@/lib/industry";

describe("CSV parsing", () => {
  it("handles quotes, commas, newlines, CRLF and a BOM", () => {
    const text = "﻿Name,Notes\r\n\"Smith, Jo\",\"Said \"\"hi\"\"\nthen left\"\r\nSam,\r\n\r\n";
    expect(parseCsv(text)).toEqual([["Name", "Notes"], ["Smith, Jo", 'Said "hi"\nthen left'], ["Sam", ""]]);
  });

  it("round-trips what it writes", () => {
    const csv = toCsv(["A", "B"], [["x, y", 'q"t'], [1, null]]);
    expect(parseCsv(csv)).toEqual([["A", "B"], ["x, y", 'q"t'], ["1", ""]]);
  });
});

describe("templates follow the industry", () => {
  it("garages import vehicles by registration with mileage and MOT; machine shops import machines by serial and hours", () => {
    const g = templateFor("assets", INDUSTRIES.garage).columns.map((c) => c.header);
    expect(g).toEqual(expect.arrayContaining(["Registration", "Mileage", "MOT due", "VIN"]));
    expect(g).not.toContain("Serial number");
    const m = templateFor("assets", INDUSTRIES.industrial).columns.map((c) => c.header);
    expect(m).toEqual(expect.arrayContaining(["Name", "Serial number", "Hours"]));
    expect(m).not.toContain("Registration");
    expect(templateFor("assets", INDUSTRIES.fleet).columns.map((c) => c.header)).toContain("Fleet number");
  });

  it("garage customers are people; industrial clients are companies", () => {
    expect(templateFor("clients", INDUSTRIES.garage).columns[0].header).toBe("Name");
    expect(templateFor("clients", INDUSTRIES.industrial).columns[0].header).toBe("Company");
  });

  it("every sample row has one value per column and passes its own checks", () => {
    for (const p of Object.values(INDUSTRIES)) {
      for (const kind of ["clients", "stock", "assets"] as const) {
        const t = templateFor(kind, p);
        const { mapping, missingRequired } = mapHeaders(t.columns.map((c) => c.header), t);
        expect(missingRequired).toEqual([]);
        for (const ex of t.examples) expect(ex.length).toBe(t.columns.length);
        expect(checkRows(t.examples, mapping, t).flatMap((r) => r.errors)).toEqual([]);
      }
    }
  });
});

describe("mapping and checking rows", () => {
  const t = templateFor("assets", INDUSTRIES.garage);

  it("matches headers people actually use", () => {
    const { mapping, missingRequired, unknownHeaders } = mapHeaders(["Reg No", "Odometer", "Customer Email", "Colour"], t);
    expect(mapping).toEqual(["registration", "meter_reading", "owner_email", null]);
    expect(missingRequired).toEqual([]);
    expect(unknownHeaders).toEqual(["Colour"]);
  });

  it("flags problems per line and tidies numbers and UK dates", () => {
    const { mapping } = mapHeaders(["Registration", "Mileage", "Owner email", "MOT due", "Service", "Service due"], t);
    const rows = checkRows([
      ["AB12 CDE", "48,200", "jo@example.com", "14/03/2027", "", ""],
      ["", "lots", "not-an-email", "2027-13-40", "Annual service", ""],
    ], mapping, t);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values.meter_reading).toBe("48200");
    expect(rows[0].values.mot_due).toBe("2027-03-14");
    expect(rows[1].line).toBe(3);
    expect(rows[1].errors).toEqual(expect.arrayContaining([
      "Registration is empty", "Mileage must be a number", "Owner email isn't an email address",
      "MOT due must be a date like 2027-03-14", "Service needs a due date or an interval",
    ]));
  });

  it("reads DD/MM/YYYY dates", () => {
    expect(normaliseDate("1/2/2027")).toBe("2027-02-01");
    expect(normaliseDate("2027-02-01")).toBe("2027-02-01");
  });
});
