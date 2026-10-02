// Industry profiles: what kind of workshop this is (workshop_settings.industry, chosen in
// Shoplane Control at setup). The profile only changes wording, which reception fields show and
// sensible defaults; the data underneath is the same for every workshop.

import { useWorkshopSettings } from "@/hooks/useWorkshopSettings";

export type Industry = "industrial" | "garage" | "fleet" | "marine_plant";
export type AssetKind = "machine" | "vehicle" | "engine" | "plant" | "vessel" | "other";
export type MeterUnit = "hours" | "miles" | "km";

export interface ReminderPreset {
  title: string;
  months?: number;
  meter?: number;
}

export interface IndustryProfile {
  key: Industry;
  label: string;
  description: string;
  asset: {
    singular: string;        // "machine"
    plural: string;          // "machines"
    navLabel: string;        // menu item
    kind: AssetKind;         // default kind for new assets
    meterUnit: MeterUnit;
  };
  intake: {
    section: string;              // reception fieldset heading
    titlePlaceholder: string;
    makePlaceholder: string;
    showSerial: boolean;
    serialLabel: string;
    showRegistration: boolean;
    showVin: boolean;
    showFleetNumber: boolean;
    meterLabel: string;
    findPlaceholder: string;
  };
  reminderPresets: ReminderPreset[];
}

export const INDUSTRIES: Record<Industry, IndustryProfile> = {
  industrial: {
    key: "industrial",
    label: "Industrial machine repair",
    description: "Machine tools, motors, pumps, gearboxes and plant brought in for repair or rebuild.",
    asset: { singular: "machine", plural: "machines", navLabel: "Machines", kind: "machine", meterUnit: "hours" },
    intake: {
      section: "Machine",
      titlePlaceholder: "e.g. Lathe, spindle noisy under load",
      makePlaceholder: "e.g. Colchester Student 1800",
      showSerial: true,
      serialLabel: "Serial or asset number",
      showRegistration: false,
      showVin: false,
      showFleetNumber: false,
      meterLabel: "Running hours (optional)",
      findPlaceholder: "Find a machine by serial, asset number or name",
    },
    reminderPresets: [
      { title: "Annual service", months: 12 },
      { title: "PUWER inspection", months: 12 },
      { title: "LOLER thorough examination", months: 6 },
      { title: "Service every 500 hours", meter: 500 },
    ],
  },
  garage: {
    key: "garage",
    label: "Garage",
    description: "Cars and light commercial vehicles: servicing, MOT work, repairs and diagnostics.",
    asset: { singular: "vehicle", plural: "vehicles", navLabel: "Vehicles", kind: "vehicle", meterUnit: "miles" },
    intake: {
      section: "Vehicle",
      titlePlaceholder: "e.g. Brake judder, service due",
      makePlaceholder: "e.g. Ford Focus 1.0 EcoBoost",
      showSerial: false,
      serialLabel: "Serial number",
      showRegistration: true,
      showVin: true,
      showFleetNumber: false,
      meterLabel: "Mileage",
      findPlaceholder: "Find a vehicle by registration",
    },
    reminderPresets: [
      { title: "MOT", months: 12 },
      { title: "Annual service", months: 12, meter: 10000 },
      { title: "Timing belt", months: 60, meter: 60000 },
      { title: "Brake fluid change", months: 24 },
    ],
  },
  fleet: {
    key: "fleet",
    label: "Service fleet",
    description: "Vans, trucks and fleet vehicles maintained for operators, with regular inspections.",
    asset: { singular: "vehicle", plural: "vehicles", navLabel: "Fleet", kind: "vehicle", meterUnit: "miles" },
    intake: {
      section: "Vehicle",
      titlePlaceholder: "e.g. Safety inspection, warning light on",
      makePlaceholder: "e.g. Ford Transit 350 L3",
      showSerial: false,
      serialLabel: "Serial number",
      showRegistration: true,
      showVin: true,
      showFleetNumber: true,
      meterLabel: "Mileage",
      findPlaceholder: "Find a vehicle by registration or fleet number",
    },
    reminderPresets: [
      { title: "Safety inspection (PMI)", months: 2 },
      { title: "MOT", months: 12 },
      { title: "Service", months: 12, meter: 15000 },
      { title: "Tachograph calibration", months: 24 },
    ],
  },
  marine_plant: {
    key: "marine_plant",
    label: "Marine & plant service",
    description: "Outboards, boats, generators and construction plant, often seasonal.",
    asset: { singular: "unit", plural: "equipment", navLabel: "Equipment", kind: "plant", meterUnit: "hours" },
    intake: {
      section: "Equipment",
      titlePlaceholder: "e.g. Outboard won't start, annual service",
      makePlaceholder: "e.g. Yamaha F60 / JCB 3CX",
      showSerial: true,
      serialLabel: "Serial, hull or plant number",
      showRegistration: false,
      showVin: false,
      showFleetNumber: false,
      meterLabel: "Engine hours (optional)",
      findPlaceholder: "Find equipment by serial, hull number or name",
    },
    reminderPresets: [
      { title: "Annual service", months: 12, meter: 100 },
      { title: "Winterisation", months: 12 },
      { title: "LOLER thorough examination", months: 12 },
      { title: "Service every 250 hours", meter: 250 },
    ],
  },
};

export const INDUSTRY_KEYS = Object.keys(INDUSTRIES) as Industry[];

export function industryProfile(key: string | null | undefined): IndustryProfile {
  return INDUSTRIES[(key as Industry) ?? "industrial"] ?? INDUSTRIES.industrial;
}

/** This workshop's profile (industrial until settings load). */
export function useIndustry(): IndustryProfile {
  const { data } = useWorkshopSettings();
  return industryProfile(data?.industry);
}

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  machine: "Machine",
  vehicle: "Vehicle",
  engine: "Engine",
  plant: "Plant",
  vessel: "Boat",
  other: "Other",
};

export const METER_LABEL: Record<MeterUnit, string> = { hours: "hours", miles: "miles", km: "km" };

/** "Reg AB12 CDE · Ford Transit" or "SN 4471 · Colchester Student" for lists and pickers. */
export function assetSummary(a: { name: string; registration?: string | null; serial_number?: string | null; fleet_number?: string | null }): string {
  const id = a.registration ? a.registration : a.fleet_number ? `Fleet ${a.fleet_number}` : a.serial_number ? `SN ${a.serial_number}` : null;
  return id ? `${id} · ${a.name}` : a.name;
}

/** UK-style registration as people write it: upper case, no stray spaces. */
export const normaliseRegistration = (v: string) => v.toUpperCase().replace(/\s+/g, " ").trim();
