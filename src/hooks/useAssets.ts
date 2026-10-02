// Data access for the asset register. Pages and dialogs use these hooks and stay presentational;
// the database's rules decide who sees and changes what.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { reminderState, worstState, type ReminderState } from "@/lib/assets";
import type { AssetKind, MeterUnit } from "@/lib/industry";

export interface Asset {
  id: string;
  client_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  kind: AssetKind;
  name: string;
  make_model: string | null;
  year_of_manufacture: number | null;
  colour: string | null;
  fuel_type: string | null;
  serial_number: string | null;
  registration: string | null;
  vin: string | null;
  fleet_number: string | null;
  meter_unit: MeterUnit | null;
  meter_reading: number | null;
  meter_read_at: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface AssetReminder {
  id: string;
  asset_id: string;
  title: string;
  interval_months: number | null;
  interval_meter: number | null;
  due_date: string | null;
  due_meter: number | null;
  last_done_on: string | null;
  last_done_meter: number | null;
  last_done_job_id: string | null;
  active: boolean;
  notes: string | null;
}

export interface AssetJob {
  id: string;
  ref: string | null;
  title: string;
  status: string;
  received_at: string | null;
  created_at: string;
  meter_reading: number | null;
}

export type AssetRow = Asset & { reminders: AssetReminder[]; state: ReminderState | null; owner: string };

export const ASSET_COLUMNS =
  "id, client_id, owner_name, owner_phone, owner_email, kind, name, make_model, year_of_manufacture, colour, fuel_type, serial_number, registration, vin, fleet_number, meter_unit, meter_reading, meter_read_at, notes, archived_at, created_at";
export const REMINDER_COLUMNS =
  "id, asset_id, title, interval_months, interval_meter, due_date, due_meter, last_done_on, last_done_meter, last_done_job_id, active, notes";

async function ownerNames(clientIds: (string | null)[]): Promise<Record<string, string>> {
  const ids = [...new Set(clientIds.filter((v): v is string => !!v))];
  if (!ids.length) return {};
  const { data } = await supabase.from("profiles").select("id, company_name, full_name").in("id", ids);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.company_name || p.full_name || "Client"]));
}

export const ownerLabel = (a: Pick<Asset, "client_id" | "owner_name">, names: Record<string, string>) =>
  (a.client_id && names[a.client_id]) || a.owner_name || "No owner recorded";

/** Every asset this person can see, with reminders and the worst reminder state. */
export function useAssetList() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["assets", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AssetRow[]> => {
      const [{ data: assets, error }, { data: reminders }] = await Promise.all([
        supabase.from("assets").select(ASSET_COLUMNS).is("archived_at", null).order("name").limit(1000),
        supabase.from("asset_reminders").select(REMINDER_COLUMNS).eq("active", true),
      ]);
      if (error) throw error;
      const names = await ownerNames((assets ?? []).map((a) => a.client_id));
      const byAsset = new Map<string, AssetReminder[]>();
      for (const r of (reminders ?? []) as AssetReminder[]) byAsset.set(r.asset_id, [...(byAsset.get(r.asset_id) ?? []), r]);
      return ((assets ?? []) as Asset[]).map((a) => {
        const rs = byAsset.get(a.id) ?? [];
        return { ...a, reminders: rs, state: worstState(rs.map((r) => reminderState(r, a.meter_reading))), owner: ownerLabel(a, names) };
      });
    },
  });
}

/** One asset with its reminders and service history. */
export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: ["asset", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: asset, error }, { data: reminders }, { data: jobs }] = await Promise.all([
        supabase.from("assets").select(ASSET_COLUMNS).eq("id", id!).maybeSingle(),
        supabase.from("asset_reminders").select(REMINDER_COLUMNS).eq("asset_id", id!).order("active", { ascending: false }).order("due_date", { ascending: true, nullsFirst: false }),
        supabase.from("jobs").select("id, ref, title, status, received_at, created_at, meter_reading").eq("asset_id", id!).order("created_at", { ascending: false }),
      ]);
      if (error) throw error;
      if (!asset) return null;
      const names = await ownerNames([asset.client_id]);
      return {
        asset: asset as Asset,
        owner: ownerLabel(asset as Asset, names),
        reminders: (reminders ?? []) as AssetReminder[],
        jobs: (jobs ?? []) as AssetJob[],
      };
    },
  });
}

/** Assets for the reception picker: one client's, or a registration/serial search. */
export async function findAssets(opts: { clientId?: string | null; query?: string }): Promise<Asset[]> {
  let q = supabase.from("assets").select(ASSET_COLUMNS).is("archived_at", null).order("name").limit(20);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const s = (opts.query ?? "").replace(/[%,()*\\]/g, " ").trim();
  if (s) {
    const compact = s.replace(/\s+/g, "");
    q = q.or(`registration.ilike.%${s}%,registration.ilike.%${compact}%,serial_number.ilike.%${s}%,fleet_number.ilike.%${s}%,name.ilike.%${s}%,vin.ilike.%${compact}%`);
  }
  const { data } = await q;
  return (data ?? []) as Asset[];
}

export type AssetInput = Omit<Asset, "id" | "created_at" | "archived_at" | "meter_read_at">;

/** Mutations, each refreshing the lists that show assets. */
export function useAssetActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const refresh = (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["assets"] });
    if (id) void qc.invalidateQueries({ queryKey: ["asset", id] });
    void qc.invalidateQueries({ queryKey: ["assets-due"] });
  };
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(e.message);
  };
  return {
    async saveAsset(input: AssetInput, id?: string): Promise<string> {
      const row = { ...input, meter_read_at: input.meter_reading != null ? new Date().toISOString() : null };
      if (id) {
        const { error } = await supabase.from("assets").update(row).eq("id", id);
        fail(error);
        refresh(id);
        return id;
      }
      const { data, error } = await supabase.from("assets").insert({ ...row, created_by: user?.id ?? null }).select("id").single();
      fail(error);
      refresh();
      return data!.id;
    },
    async archiveAsset(id: string) {
      const { error } = await supabase.from("assets").update({ archived_at: new Date().toISOString() }).eq("id", id);
      fail(error);
      refresh(id);
    },
    async updateMeter(id: string, reading: number) {
      const { error } = await supabase.from("assets").update({ meter_reading: reading, meter_read_at: new Date().toISOString() }).eq("id", id);
      fail(error);
      refresh(id);
    },
    async saveReminder(assetId: string, input: Omit<AssetReminder, "id" | "asset_id" | "last_done_on" | "last_done_meter" | "last_done_job_id">, id?: string) {
      const row = { ...input, asset_id: assetId, notified_at: null };
      const { error } = id
        ? await supabase.from("asset_reminders").update(row).eq("id", id)
        : await supabase.from("asset_reminders").insert(row);
      fail(error);
      refresh(assetId);
    },
    async deleteReminder(assetId: string, id: string) {
      const { error } = await supabase.from("asset_reminders").delete().eq("id", id);
      fail(error);
      refresh(assetId);
    },
    async completeReminder(assetId: string, id: string, doneOn: string, meter: number | null, jobId: string | null) {
      const { error } = await supabase.rpc("complete_asset_reminder", { _reminder: id, _done_on: doneOn, _meter: meter ?? undefined, _job: jobId ?? undefined });
      fail(error);
      refresh(assetId);
    },
  };
}

/** How many reminders are due soon or overdue (for Today and the menu badge). */
export function useDueReminderCount(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["assets-due", user?.id],
    enabled: !!user && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: reminders }, { data: assets }] = await Promise.all([
        supabase.from("asset_reminders").select("asset_id, title, active, due_date, due_meter, interval_meter").eq("active", true),
        supabase.from("assets").select("id, meter_reading").is("archived_at", null),
      ]);
      const meter = new Map((assets ?? []).map((a) => [a.id, a.meter_reading as number | null]));
      return (reminders ?? []).filter((r) => meter.has(r.asset_id) && reminderState(r, meter.get(r.asset_id) ?? null) !== "ok").length;
    },
  });
}

/** Portal clients reception can pick as an owner (empty for people without Reception). */
export function useReceptionClients(enabled: boolean) {
  return useQuery({
    queryKey: ["reception-clients"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("reception_clients");
      return (data ?? []) as { id: string; full_name: string | null; company_name: string | null; phone: string | null; email: string | null }[];
    },
  });
}

/** Reminders that are due soon or overdue, for Today's attention list. */
export async function fetchDueReminders(): Promise<{ asset: string; title: string; overdue: boolean }[]> {
  const [{ data: reminders }, { data: assets }] = await Promise.all([
    supabase.from("asset_reminders").select("asset_id, title, active, due_date, due_meter, interval_meter").eq("active", true),
    supabase.from("assets").select("id, name, meter_reading").is("archived_at", null),
  ]);
  const byId = new Map((assets ?? []).map((a) => [a.id, a]));
  const out: { asset: string; title: string; overdue: boolean }[] = [];
  for (const r of reminders ?? []) {
    const a = byId.get(r.asset_id);
    if (!a) continue;
    const s = reminderState(r, a.meter_reading);
    if (s === "overdue" || s === "due_soon") out.push({ asset: a.name, title: r.title, overdue: s === "overdue" });
  }
  return out;
}

/**
 * Sets an asset's MOT reminder to the expiry date from a registration lookup: adds one (yearly)
 * if it has none, or moves an existing one to the official date. Returns what it did.
 */
export async function ensureMotReminder(assetId: string, motExpiry: string): Promise<"added" | "updated" | "unchanged"> {
  const { data: existing } = await supabase.from("asset_reminders").select("id, due_date").eq("asset_id", assetId).eq("active", true).ilike("title", "MOT").limit(1).maybeSingle();
  if (existing) {
    if (existing.due_date === motExpiry) return "unchanged";
    const { error } = await supabase.from("asset_reminders").update({ due_date: motExpiry, notified_at: null }).eq("id", existing.id);
    return error ? "unchanged" : "updated";
  }
  const { error } = await supabase.from("asset_reminders").insert({ asset_id: assetId, title: "MOT", interval_months: 12, due_date: motExpiry });
  return error ? "unchanged" : "added";
}

/** Fills in an asset's year, colour and fuel where they're still empty (never overwrites). */
export async function fillAssetDetails(assetId: string, details: { year_of_manufacture: number | null; colour: string | null; fuel_type: string | null }) {
  const { data } = await supabase.from("assets").select("year_of_manufacture, colour, fuel_type").eq("id", assetId).maybeSingle();
  if (!data) return;
  const patch: Partial<typeof details> = {};
  if (data.year_of_manufacture == null && details.year_of_manufacture != null) patch.year_of_manufacture = details.year_of_manufacture;
  if (!data.colour && details.colour) patch.colour = details.colour;
  if (!data.fuel_type && details.fuel_type) patch.fuel_type = details.fuel_type;
  if (Object.keys(patch).length) await supabase.from("assets").update(patch).eq("id", assetId);
}
