// CSV import: parsing, the templates for each kind of data (shaped by the workshop's industry),
// and row validation. Pure, so the page, the sample files and the tests agree.

import type { IndustryProfile } from "@/lib/industry";

export type ImportKind = "clients" | "stock" | "assets";

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes, a BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [headers.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\r\n");
}

export interface Column {
  key: string;
  header: string;
  required?: boolean;
  /** Other headers people use for this column (matched case- and space-insensitively). */
  aliases?: string[];
  type?: "text" | "email" | "number" | "date" | "integer";
  help?: string;
}

export interface Template {
  kind: ImportKind;
  title: string;
  description: string;
  columns: Column[];
  examples: string[][];
}

/** The columns and sample rows for each kind of data, worded for this workshop. */
export function templateFor(kind: ImportKind, p: IndustryProfile): Template {
  if (kind === "clients") {
    const personFirst = p.customer.personFirst;
    const columns: Column[] = personFirst
      ? [
          { key: "full_name", header: "Name", required: true, aliases: ["customer", "customer name", "full name", "contact"] },
          { key: "company_name", header: "Company", aliases: ["company name", "business"] },
          { key: "email", header: "Email", required: true, type: "email", aliases: ["email address", "e-mail"] },
          { key: "phone", header: "Phone", aliases: ["mobile", "telephone", "phone number"] },
          { key: "address", header: "Address", aliases: ["street"] },
          { key: "postcode", header: "Postcode / ZIP", aliases: ["postcode", "post code", "zip", "zip code", "postal code"] },
        ]
      : [
          { key: "company_name", header: "Company", required: true, aliases: ["company name", "customer", "business", "name"] },
          { key: "contact_person", header: "Contact", aliases: ["contact person", "contact name"] },
          { key: "email", header: "Email", required: true, type: "email", aliases: ["email address", "e-mail"] },
          { key: "phone", header: "Phone", aliases: ["mobile", "telephone", "phone number"] },
          { key: "address", header: "Address", aliases: ["street"] },
          { key: "postcode", header: "Postcode / ZIP", aliases: ["postcode", "post code", "zip", "zip code", "postal code"] },
        ];
    return {
      kind,
      title: personFirst ? "Customers" : "Clients",
      description: `Each row becomes a ${p.customer.noun} with a portal login. Nobody is emailed; use Send sign-in link on the Clients page when you're ready to invite them.`,
      columns,
      examples: personFirst
        ? [["Jo Smith", "", "jo.smith@example.com", "07700 900123", "12 High Street, Leeds", "LS1 4AP"],
           ["Sam Patel", "Patel Plumbing Ltd", "sam@patelplumbing.example", "0113 496 0000", "Unit 3, Mill Road, Leeds", "LS9 8AB"]]
        : [["Acme Fabrication Ltd", "Jane Doe", "orders@acme.example", "0161 496 0123", "Unit 4, Trafford Park, Manchester", "M17 1AB"],
           ["Northern Quarries plc", "Tom Reed", "maintenance@nq.example", "01535 496000", "Moor Lane, Keighley", "BD20 6QT"]],
    };
  }
  if (kind === "stock") {
    return {
      kind,
      title: "Stock",
      description: "Each row becomes a stock item with its opening quantity. Suppliers are matched by name, or added.",
      columns: [
        { key: "name", header: "Name", required: true, aliases: ["item", "part", "description", "item name"] },
        { key: "sku", header: "SKU", aliases: ["part number", "part no", "code", "item code"] },
        { key: "category", header: "Category", aliases: ["group", "type"] },
        { key: "unit", header: "Unit", aliases: ["uom", "units"], help: "pcs, m, kg, L" },
        { key: "quantity", header: "Quantity", type: "number", aliases: ["qty", "stock", "on hand", "opening stock"] },
        { key: "unit_cost", header: "Unit cost", type: "number", aliases: ["cost", "price", "cost price"] },
        { key: "min_stock", header: "Reorder at", type: "number", aliases: ["min stock", "minimum", "reorder level", "reorder point"] },
        { key: "reorder_quantity", header: "Reorder quantity", type: "number", aliases: ["order quantity", "reorder qty"] },
        { key: "supplier", header: "Supplier", aliases: ["vendor", "supplier name"] },
        { key: "location", header: "Location", aliases: ["shelf", "bin", "shelf location"] },
      ],
      examples: p.key === "garage" || p.key === "fleet"
        ? [["Oil filter", "OF-123", "Filters", "pcs", "24", "4.20", "6", "24", "Euro Car Parts", "Rack A1"],
           ["5W-30 engine oil", "OIL-5W30-5L", "Oils", "L", "60", "5.10", "20", "40", "Opie Oils", "Bay 2"]]
        : [["Bearing 6204-2RS", "6204-2RS", "Bearings", "pcs", "40", "3.85", "10", "50", "Bearing Boys", "Rack B, bin 4"],
           ["Hydraulic seal kit 40mm", "SK-40", "Seals", "pcs", "12", "18.50", "4", "10", "Hydraulic Supplies Ltd", "Rack C2"]],
    };
  }
  const vehicle = p.asset.kind === "vehicle";
  const unit = p.asset.meterUnit;
  const columns: Column[] = [
    { key: "owner_email", header: "Owner email", type: "email", aliases: ["customer email", "client email", "email"], help: "Matches a client by email. Leave empty for a walk-in owner." },
    { key: "owner_name", header: "Owner name", aliases: ["customer", "owner", "client", "customer name"] },
    { key: "owner_phone", header: "Owner phone", aliases: ["phone", "customer phone"] },
    ...(vehicle
      ? [
          { key: "registration", header: "Registration", required: true, aliases: ["reg", "reg no", "registration number", "vrm", "plate"] },
          { key: "make_model", header: "Make and model", aliases: ["make", "model", "vehicle"] },
          { key: "year", header: "Year", type: "integer" as const, aliases: ["year of manufacture", "model year", "yom", "built"] },
          { key: "colour", header: "Colour", aliases: ["color"] },
          { key: "fuel_type", header: "Fuel", aliases: ["fuel type"] },
          { key: "vin", header: "VIN", aliases: ["chassis", "chassis number"] },
          ...(p.intake.showFleetNumber ? [{ key: "fleet_number", header: "Fleet number", aliases: ["fleet no", "unit number"] }] : []),
        ]
      : [
          { key: "name", header: "Name", required: true, aliases: ["machine", "equipment", "asset", "description"] },
          { key: "make_model", header: "Make and model", aliases: ["make", "model"] },
          { key: "serial_number", header: "Serial number", aliases: ["serial", "serial no", "asset number", "hull number"] },
        ]),
    { key: "meter_reading", header: vehicle ? "Mileage" : "Hours", type: "number", aliases: ["mileage", "miles", "hours", "odometer", "running hours", "engine hours", "reading"] },
    { key: "service_title", header: "Service", aliases: ["service name", "next service", "inspection"], help: "A reminder to create, e.g. Annual service" },
    { key: "service_due", header: "Service due", type: "date", aliases: ["next service due", "due", "due date"], help: "YYYY-MM-DD" },
    { key: "service_every_months", header: "Service every (months)", type: "integer", aliases: ["interval", "every months", "service interval"] },
    ...(vehicle ? [{ key: "mot_due", header: "MOT due", type: "date" as const, aliases: ["mot", "mot expiry", "mot date"], help: "YYYY-MM-DD; adds a yearly MOT reminder" }] : []),
    { key: "notes", header: "Notes", aliases: ["comments"] },
  ];
  return {
    kind,
    title: p.asset.navLabel,
    description: `Each row becomes a ${p.asset.singular} in the asset register, linked to its owner, with an optional service reminder${vehicle ? " and MOT reminder" : ""}. Readings are in ${unit}.`,
    columns,
    examples: vehicle
      ? p.intake.showFleetNumber
        ? [["fleet@nq.example", "", "", "AB12 CDE", "Ford Transit 350", "2019", "White", "Diesel", "WF0XXXTTGXXX12345", "17", "84500", "Safety inspection (PMI)", "2026-12-01", "2", "2027-03-14", "Tail lift fitted"],
           ["", "Kestrel Motors", "0113 496 0101", "XY65 ZZA", "Mercedes Sprinter", "2018", "Silver", "Diesel", "", "22", "121300", "Service", "2027-01-15", "12", "2026-11-02", ""]]
        : [["jo.smith@example.com", "", "", "AB12 CDE", "Ford Focus 1.0", "2017", "Blue", "Petrol", "WF0XXXGCDXXX12345", "48200", "Annual service", "2027-02-01", "12", "2027-03-14", ""],
           ["", "Sam Patel", "07700 900456", "XY65 ZZA", "VW Golf 2.0 TDI", "2015", "Grey", "Diesel", "", "91800", "Annual service", "2026-12-10", "12", "2026-11-02", "Timing belt due soon"]]
      : [["orders@acme.example", "", "", "Lathe", "Colchester Student 1800", "4471", "1200", "Annual service", "2027-01-31", "12", "Bay 3"],
         ["", "Northern Quarries plc", "01535 496000", "Conveyor gearbox", "Radicon Series M", "RG-88213", "8600", "LOLER thorough examination", "2026-12-15", "6", ""]],
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface Mapped {
  /** Template key for each CSV column, or null when it's not used. */
  mapping: (string | null)[];
  missingRequired: Column[];
  unknownHeaders: string[];
}

export function mapHeaders(headers: string[], t: Template): Mapped {
  const used = new Set<string>();
  const mapping = headers.map((h) => {
    const n = norm(h);
    const col = t.columns.find((c) => !used.has(c.key) && (norm(c.header) === n || (c.aliases ?? []).some((a) => norm(a) === n)));
    if (col) used.add(col.key);
    return col?.key ?? null;
  });
  return {
    mapping,
    missingRequired: t.columns.filter((c) => c.required && !used.has(c.key)),
    unknownHeaders: headers.filter((_, i) => !mapping[i]),
  };
}

export interface RowCheck {
  line: number;                       // line in the file, for people to find it
  values: Record<string, string>;
  errors: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Turns DD/MM/YYYY (how UK spreadsheets save dates) into YYYY-MM-DD. */
export function normaliseDate(v: string): string {
  const m = v.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : v.trim();
}

export function checkRows(rows: string[][], mapping: (string | null)[], t: Template): RowCheck[] {
  return rows.map((r, i) => {
    const values: Record<string, string> = {};
    mapping.forEach((key, c) => {
      if (key) values[key] = (r[c] ?? "").trim();
    });
    const errors: string[] = [];
    for (const col of t.columns) {
      let v = values[col.key] ?? "";
      if (col.required && !v) errors.push(`${col.header} is empty`);
      if (!v) continue;
      if (col.type === "email" && !EMAIL.test(v)) errors.push(`${col.header} isn't an email address`);
      if (col.type === "number" || col.type === "integer") {
        const n = Number(v.replace(/[£$€,\s]/g, ""));
        if (Number.isNaN(n) || n < 0) errors.push(`${col.header} must be a number`);
        else if (col.type === "integer" && !Number.isInteger(n)) errors.push(`${col.header} must be a whole number`);
        else values[col.key] = String(n);
      }
      if (col.type === "date") {
        v = normaliseDate(v);
        if (!DATE.test(v) || Number.isNaN(Date.parse(v))) errors.push(`${col.header} must be a date like 2027-03-14`);
        else values[col.key] = v;
      }
    }
    if (t.kind === "assets" && values.service_title && !values.service_due && !values.service_every_months) {
      errors.push("Service needs a due date or an interval");
    }
    return { line: i + 2, values, errors };
  });
}

export const MAX_IMPORT_ROWS = 2000;
