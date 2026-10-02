// Self-serve CSV import for admins and managers.
//
// POST { kind: "clients" | "stock" | "assets", rows: [{ line, values }] }   (up to 100 rows a call)
//   → { results: [{ line, status: "created" | "skipped" | "failed", message?, id? }] }
//
// The page checks and maps the CSV first (src/lib/csvImport.ts); this function re-checks what
// matters and writes with the service role. Clients get portal accounts with no email sent.
// Existing records (same email, SKU or name, registration or serial) are skipped, not changed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { captureEdgeError } from "../_shared/sentry.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";

type Row = { line: number; values: Record<string, string> };
type Result = { line: number; status: "created" | "skipped" | "failed"; message?: string; id?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const t = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max) || null;
const n = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const x = Number(s);
  return Number.isFinite(x) && x >= 0 ? x : null;
};
const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

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
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", uid).in("role", ["admin", "manager"]).limit(1).maybeSingle();
    if (!roleRow) return json({ error: "Only admins and managers can import data." }, 403);
    if (!(await sessionVerified(authHeader))) return json({ error: MFA_REQUIRED }, 403);

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind ?? "");
    const rows: Row[] = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
    if (!["clients", "stock", "assets"].includes(kind)) return json({ error: "Unknown kind of data" }, 400);
    if (!rows.length) return json({ error: "No rows" }, 400);
    const results: Result[] = [];

    // ---------------------------------------------------------------- clients
    if (kind === "clients") {
      for (const { line, values: v } of rows) {
        const email = String(v.email ?? "").trim().toLowerCase();
        const name = t(v.full_name, 200) ?? t(v.company_name, 200);
        if (!EMAIL.test(email)) { results.push({ line, status: "failed", message: "Email isn't valid" }); continue; }
        if (!name) { results.push({ line, status: "failed", message: "Name is empty" }); continue; }
        await admin.rpc("provision_account", { _email: email, _role: "client" });
        const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: name } });
        if (error) {
          const exists = /already|registered|exists/i.test(error.message);
          results.push({ line, status: exists ? "skipped" : "failed", message: exists ? "Someone with this email already has an account" : error.message });
          continue;
        }
        const address = [t(v.address, 300), t(v.postcode, 20)].filter(Boolean).join(", ") || null;
        await admin.from("profiles").update({
          full_name: name,
          company_name: t(v.company_name, 200),
          contact_person: t(v.contact_person, 200),
          phone: t(v.phone, 50),
          address,
        }).eq("id", created.user!.id);
        results.push({ line, status: "created", id: created.user!.id });
      }
    }

    // ---------------------------------------------------------------- stock
    if (kind === "stock") {
      const { data: suppliers } = await admin.from("suppliers").select("id, name");
      const supplierByName = new Map((suppliers ?? []).map((s) => [s.name.trim().toLowerCase(), s.id]));
      const { data: items } = await admin.from("inventory_items").select("name, sku");
      const skus = new Set((items ?? []).map((i) => (i.sku ?? "").trim().toLowerCase()).filter(Boolean));
      const names = new Set((items ?? []).map((i) => i.name.trim().toLowerCase()));
      for (const { line, values: v } of rows) {
        const name = t(v.name, 200);
        if (!name) { results.push({ line, status: "failed", message: "Name is empty" }); continue; }
        const sku = t(v.sku, 100);
        if ((sku && skus.has(sku.toLowerCase())) || (!sku && names.has(name.toLowerCase()))) {
          results.push({ line, status: "skipped", message: sku ? `An item with SKU ${sku} already exists` : "An item with this name already exists" });
          continue;
        }
        let supplierId: string | null = null;
        const supplierName = t(v.supplier, 200);
        if (supplierName) {
          supplierId = supplierByName.get(supplierName.toLowerCase()) ?? null;
          if (!supplierId) {
            const { data: s, error } = await admin.from("suppliers").insert({ name: supplierName }).select("id").single();
            if (!error && s) { supplierId = s.id; supplierByName.set(supplierName.toLowerCase(), s.id); }
          }
        }
        const { data, error } = await admin.from("inventory_items").insert({
          name, sku, category: t(v.category, 100), unit: t(v.unit, 20) ?? "pcs",
          quantity: n(v.quantity) ?? 0, unit_cost: n(v.unit_cost) ?? 0, min_stock: n(v.min_stock) ?? 0,
          reorder_quantity: n(v.reorder_quantity), supplier_id: supplierId, location: t(v.location, 100),
        }).select("id").single();
        if (error) { results.push({ line, status: "failed", message: error.message }); continue; }
        if (sku) skus.add(sku.toLowerCase()); else names.add(name.toLowerCase());
        results.push({ line, status: "created", id: data.id });
      }
    }

    // ---------------------------------------------------------------- assets
    if (kind === "assets") {
      const { data: ws } = await admin.from("workshop_settings").select("industry").eq("id", 1).maybeSingle();
      const vehicleShop = ["garage", "fleet"].includes(ws?.industry ?? "");
      const unit = vehicleShop ? "miles" : "hours";
      const { data: existing } = await admin.from("assets").select("registration, serial_number").is("archived_at", null);
      const regs = new Set((existing ?? []).map((a) => (a.registration ?? "").replace(/\s+/g, "").toUpperCase()).filter(Boolean));
      const serials = new Set((existing ?? []).map((a) => (a.serial_number ?? "").trim().toUpperCase()).filter(Boolean));
      const emails = [...new Set(rows.map((r) => String(r.values.owner_email ?? "").trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
      const clientByEmail = new Map<string, string>();
      for (const email of emails) {
        const { data: id } = await admin.rpc("client_id_by_email", { _email: email });
        if (id) clientByEmail.set(email, id as string);
      }
      for (const { line, values: v } of rows) {
        const reg = t(v.registration, 20)?.toUpperCase().replace(/\s+/g, " ") ?? null;
        const serial = t(v.serial_number, 100);
        const name = t(v.name, 200) ?? t(v.make_model, 200) ?? reg;
        if (!name) { results.push({ line, status: "failed", message: vehicleShop ? "Registration is empty" : "Name is empty" }); continue; }
        if (reg && regs.has(reg.replace(/\s+/g, ""))) { results.push({ line, status: "skipped", message: `${reg} is already in the register` }); continue; }
        if (serial && serials.has(serial.toUpperCase())) { results.push({ line, status: "skipped", message: `Serial ${serial} is already in the register` }); continue; }
        const ownerEmail = String(v.owner_email ?? "").trim().toLowerCase();
        const clientId = ownerEmail ? clientByEmail.get(ownerEmail) ?? null : null;
        if (ownerEmail && !clientId) { results.push({ line, status: "failed", message: `No client with email ${ownerEmail}. Import clients first, or leave the email empty for a walk-in owner.` }); continue; }
        const meter = n(v.meter_reading);
        const year = n(v.year);
        const { data: asset, error } = await admin.from("assets").insert({
          client_id: clientId,
          owner_name: clientId ? null : t(v.owner_name, 200),
          owner_phone: clientId ? null : t(v.owner_phone, 50),
          kind: vehicleShop || reg ? "vehicle" : ws?.industry === "marine_plant" ? "plant" : "machine",
          name, make_model: t(v.make_model, 200), serial_number: serial, registration: reg,
          year_of_manufacture: year != null && Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
          colour: t(v.colour, 50), fuel_type: t(v.fuel_type, 50),
          vin: t(v.vin, 17)?.toUpperCase() ?? null, fleet_number: t(v.fleet_number, 50),
          meter_unit: unit, meter_reading: meter, meter_read_at: meter != null ? new Date().toISOString() : null,
          notes: t(v.notes, 2000), created_by: uid,
        }).select("id").single();
        if (error) { results.push({ line, status: "failed", message: error.message }); continue; }
        const reminders: Record<string, unknown>[] = [];
        const months = n(v.service_every_months);
        const title = t(v.service_title, 120);
        const due = DATE.test(String(v.service_due ?? "")) ? String(v.service_due) : months ? addMonths(new Date().toISOString().slice(0, 10), months) : null;
        if (title && due) reminders.push({ asset_id: asset.id, title, interval_months: months && Number.isInteger(months) ? months : null, due_date: due });
        if (DATE.test(String(v.mot_due ?? ""))) reminders.push({ asset_id: asset.id, title: "MOT", interval_months: 12, due_date: String(v.mot_due) });
        if (reminders.length) await admin.from("asset_reminders").insert(reminders);
        if (reg) regs.add(reg.replace(/\s+/g, "")); if (serial) serials.add(serial.toUpperCase());
        results.push({ line, status: "created", id: asset.id, message: reminders.length ? `${reminders.length} reminder${reminders.length > 1 ? "s" : ""} added` : undefined });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    if (created) {
      await admin.from("activity_logs").insert({
        user_id: uid, action: "created", table_name: kind === "clients" ? "profiles" : kind === "stock" ? "inventory_items" : "assets",
        record_id: kind, summary: `Imported ${created} ${kind} from a CSV file`, details: { kind, created, rows: rows.length, source: "import" },
      });
    }
    return json({ results });
  } catch (e) {
    await captureEdgeError(e, "import-data");
    return json({ error: "The import stopped unexpectedly. Rows before this batch were saved; try the rest again." }, 500);
  }
});
