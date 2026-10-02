// What each assistant tool does. Every query runs on `db`, a client signed in as the person
// asking, so the database's own rules decide what comes back: a client only ever gets their own
// records, and staff only the projects they work on. Nothing here writes.

import type { Role } from "./core.ts";

type Db = any;
const OPEN = ["received", "evaluation", "quote", "pending", "in_progress", "review"];
const STATUS_LABEL: Record<string, string> = {
  received: "Received", evaluation: "Evaluating", quote: "Quote sent", pending: "Approved",
  in_progress: "In progress", review: "Quality check", completed: "Ready to ship", shipped: "Shipped", cancelled: "Cancelled",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const limitOf = (v: unknown, d = 10) => Math.min(Math.max(Number(v) || d, 1), 25);
const clean = (v: unknown) => String(v ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
const isoDate = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);

export interface ToolContext {
  db: Db;
  role: Role;
  userId: string;
}

export interface ToolOutcome {
  content: unknown;
  /** A draft message for the client to send (offer_message_to_workshop). */
  draft?: { project_id: string; project_ref: string | null; project_title: string; message: string };
}

async function names(db: Db, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))];
  if (!unique.length) return {};
  const { data } = await db.from("profiles").select("id, full_name, company_name").in("id", unique);
  return Object.fromEntries((data ?? []).map((p: any) => [p.id, p.company_name || p.full_name || "—"]));
}

async function findProject(db: Db, key: unknown) {
  const k = String(key ?? "").trim();
  if (!k) return null;
  const cols = "id, ref, title, status, priority, description, make_model, serial_number, due_date, received_at, created_at, updated_at, client_id, assigned_staff_id, estimated_hours, actual_hours";
  const q = UUID.test(k) ? db.from("jobs").select(cols).eq("id", k) : db.from("jobs").select(cols).ilike("ref", clean(k));
  const { data } = await q.maybeSingle();
  return data;
}

const notFound = (what: string) => ({ error: `No ${what} found that this person can see.` });

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const { db, role } = ctx;
  const staffSide = role !== "client";

  switch (name) {
    case "find_projects": {
      let q = db.from("jobs").select("id, ref, title, status, priority, make_model, due_date, updated_at, client_id, assigned_staff_id")
        .order("updated_at", { ascending: false }).limit(limitOf(input.limit));
      const s = clean(input.search);
      if (s) q = q.or(`ref.ilike.%${s}%,title.ilike.%${s}%,make_model.ilike.%${s}%,serial_number.ilike.%${s}%`);
      if (input.status) q = q.eq("status", String(input.status));
      else if (input.open_only) q = q.in("status", OPEN);
      const [{ data, error }, counts] = await Promise.all([q, db.from("jobs").select("status")]);
      if (error) return { content: { error: error.message } };
      const who = staffSide ? await names(db, (data ?? []).flatMap((j: any) => [j.client_id, j.assigned_staff_id])) : {};
      const byStatus: Record<string, number> = {};
      for (const r of counts.data ?? []) byStatus[STATUS_LABEL[r.status] ?? r.status] = (byStatus[STATUS_LABEL[r.status] ?? r.status] ?? 0) + 1;
      return {
        content: {
          projects: (data ?? []).map((j: any) => ({
            id: j.id, ref: j.ref, title: j.title, status: STATUS_LABEL[j.status] ?? j.status, priority: j.priority,
            make_model: j.make_model, due_date: j.due_date, last_activity: j.updated_at, link: `/projects/${j.id}`,
            ...(staffSide ? { client: who[j.client_id] ?? null, assigned_to: who[j.assigned_staff_id] ?? null } : {}),
          })),
          all_projects_by_status: byStatus,
        },
      };
    }

    case "get_project": {
      const p = await findProject(db, input.project);
      if (!p) return { content: notFound("project") };
      const [tasks, quotes, invoices, shipments, events, comments] = await Promise.all([
        db.from("job_tasks").select("title, status, due_date, assigned_to, completed_at").eq("job_id", p.id).order("order_index"),
        db.from("project_quotes").select("number, title, kind, status, subtotal, currency, sent_at, valid_until, decided_at").eq("job_id", p.id).order("created_at"),
        db.from("invoices").select("id, invoice_number, status, total, currency, due_date, paid_at").eq("job_id", p.id).neq("status", staffSide ? "__none__" : "draft"),
        db.from("shipments").select("method, status, carrier, tracking_number, tracking_url, preferred_date, shipped_at").eq("job_id", p.id),
        (staffSide ? db.from("project_events").select("kind, created_at, data") : db.from("project_events").select("kind, created_at").eq("client_visible", true))
          .eq("job_id", p.id).order("created_at", { ascending: false }).limit(10),
        db.from("job_comments").select("body, is_internal, created_at, user_id").eq("job_id", p.id).order("created_at", { ascending: false }).limit(8),
      ]);
      const who = await names(db, [p.client_id, p.assigned_staff_id, ...(tasks.data ?? []).map((t: any) => t.assigned_to), ...(comments.data ?? []).map((c: any) => c.user_id)]);
      return {
        content: {
          id: p.id, ref: p.ref, title: p.title, status: STATUS_LABEL[p.status] ?? p.status, priority: p.priority,
          description: p.description, make_model: p.make_model, serial_number: p.serial_number,
          received: p.received_at ?? p.created_at, due_date: p.due_date, last_activity: p.updated_at, link: `/projects/${p.id}`,
          ...(staffSide
            ? { client: who[p.client_id] ?? null, assigned_to: who[p.assigned_staff_id] ?? null, estimated_hours: p.estimated_hours, actual_hours: p.actual_hours }
            : {}),
          tasks: (tasks.data ?? []).map((t: any) => ({ ...t, assigned_to: staffSide ? who[t.assigned_to] ?? null : undefined })),
          quotes: quotes.data ?? [],
          invoices: (invoices.data ?? []).map((i: any) => ({ ...i, link: `/invoices/${i.id}` })),
          shipping: shipments.data ?? [],
          recent_events: events.data ?? [],
          recent_messages: (comments.data ?? []).map((c: any) => ({
            from: who[c.user_id] ?? "—", body: String(c.body ?? "").slice(0, 400), created_at: c.created_at,
            ...(staffSide ? { team_only: c.is_internal } : {}),
          })),
        },
      };
    }

    case "list_invoices": {
      let q = db.from("invoices").select("id, invoice_number, status, total, currency, due_date, paid_at, created_at, client_id, job_id")
        .order("created_at", { ascending: false }).limit(limitOf(input.limit));
      if (!staffSide) q = q.neq("status", "draft");
      if (input.status) q = q.eq("status", String(input.status));
      else if (input.unpaid_only) q = q.in("status", ["sent", "overdue"]);
      const { data, error } = await q;
      if (error) return { content: { error: error.message } };
      const who = staffSide ? await names(db, (data ?? []).map((i: any) => i.client_id)) : {};
      const today = new Date().toISOString().slice(0, 10);
      return {
        content: {
          invoices: (data ?? []).map((i: any) => ({
            number: i.invoice_number, status: i.status, total: i.total, currency: i.currency, due_date: i.due_date, paid_at: i.paid_at,
            overdue: i.status !== "paid" && i.status !== "cancelled" && !!i.due_date && i.due_date < today,
            link: `/invoices/${i.id}`, ...(staffSide ? { client: who[i.client_id] ?? null } : {}),
          })),
        },
      };
    }

    case "list_appointments": {
      const from = isoDate(input.from) ?? new Date().toISOString().slice(0, 10);
      const to = isoDate(input.to) ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await db.from("appointments")
        .select("id, title, type, status, appointment_date, appointment_time, duration_minutes, client_id, job_id")
        .gte("appointment_date", from).lte("appointment_date", to)
        .order("appointment_date").order("appointment_time").limit(limitOf(input.limit, 15));
      if (error) return { content: { error: error.message } };
      const who = staffSide ? await names(db, (data ?? []).map((a: any) => a.client_id)) : {};
      return {
        content: {
          from, to,
          appointments: (data ?? []).map((a: any) => ({
            title: a.title, type: a.type, status: a.status, date: a.appointment_date, time: a.appointment_time,
            minutes: a.duration_minutes, link: `/appointments/${a.id}`, ...(staffSide ? { client: who[a.client_id] ?? null } : {}),
          })),
        },
      };
    }

    case "list_requests": {
      let q = db.from("client_requests")
        .select("title, request_type, status, priority, preferred_date, quoted_total, quoted_currency, quote_expires_at, decline_reason, created_at, converted_job_id, client_id")
        .order("created_at", { ascending: false }).limit(limitOf(input.limit));
      if (input.status) q = q.eq("status", String(input.status));
      const { data, error } = await q;
      if (error) return { content: { error: error.message } };
      const who = staffSide ? await names(db, (data ?? []).map((r: any) => r.client_id)) : {};
      return {
        content: {
          requests: (data ?? []).map((r: any) => ({
            ...r, client_id: undefined, converted_job_id: undefined,
            project_link: r.converted_job_id ? `/projects/${r.converted_job_id}` : null,
            ...(staffSide ? { client: who[r.client_id] ?? null } : {}),
          })),
        },
      };
    }

    case "search_stock": {
      let q = db.from("inventory_items").select("name, sku, category, quantity, unit, min_stock, reorder_quantity, location, supplier_id")
        .order("name").limit(input.low_only ? 200 : limitOf(input.limit));
      const s = clean(input.search);
      if (s) q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%,category.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) return { content: { error: error.message } };
      let items = (data ?? []).map((i: any) => ({ ...i, low: i.min_stock != null && i.quantity <= i.min_stock }));
      if (input.low_only) items = items.filter((i: any) => i.low).slice(0, limitOf(input.limit));
      const supplierIds = [...new Set(items.map((i: any) => i.supplier_id).filter(Boolean))];
      const { data: suppliers } = supplierIds.length ? await db.from("suppliers").select("id, name").in("id", supplierIds) : { data: [] };
      const supplier = Object.fromEntries((suppliers ?? []).map((s: any) => [s.id, s.name]));
      return { content: { items: items.map((i: any) => ({ ...i, supplier_id: undefined, supplier: supplier[i.supplier_id] ?? null })) } };
    }

    case "find_assets": {
      let q = db.from("assets")
        .select("id, name, kind, make_model, serial_number, registration, fleet_number, meter_reading, meter_unit, client_id, owner_name")
        .is("archived_at", null).order("name").limit(input.due_only ? 200 : limitOf(input.limit));
      const s = clean(input.search);
      if (s) {
        const compact = s.replace(/\s+/g, "");
        q = q.or(`registration.ilike.%${s}%,registration.ilike.%${compact}%,serial_number.ilike.%${s}%,fleet_number.ilike.%${s}%,name.ilike.%${s}%`);
      }
      const { data: assets, error } = await q;
      if (error) return { content: { error: error.message } };
      const ids = (assets ?? []).map((a: any) => a.id);
      const [{ data: reminders }, { data: jobs }] = ids.length
        ? await Promise.all([
          db.from("asset_reminders").select("asset_id, title, due_date, due_meter, interval_months, interval_meter, last_done_on").in("asset_id", ids).eq("active", true),
          db.from("jobs").select("id, ref, title, status, asset_id, created_at").in("asset_id", ids).order("created_at", { ascending: false }).limit(60),
        ])
        : [{ data: [] }, { data: [] }];
      const today = new Date().toISOString().slice(0, 10);
      const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const who = staffSide ? await names(db, (assets ?? []).map((a: any) => a.client_id)) : {};
      let rows = (assets ?? []).map((a: any) => {
        const rs = (reminders ?? []).filter((r: any) => r.asset_id === a.id).map((r: any) => {
          const meterDue = r.due_meter != null && a.meter_reading != null;
          const overdue = (r.due_date && r.due_date < today) || (meterDue && a.meter_reading >= r.due_meter);
          const dueSoon = !overdue && ((r.due_date && r.due_date <= soon) ||
            (meterDue && a.meter_reading >= r.due_meter - Math.max((r.interval_meter ?? r.due_meter) * 0.1, 1)));
          return { title: r.title, due_date: r.due_date, due_reading: r.due_meter, last_done: r.last_done_on, state: overdue ? "overdue" : dueSoon ? "due soon" : "scheduled" };
        });
        return {
          name: a.name, make_model: a.make_model, registration: a.registration, serial_number: a.serial_number, fleet_number: a.fleet_number,
          reading: a.meter_reading != null ? `${Math.round(a.meter_reading)} ${a.meter_unit ?? ""}`.trim() : null,
          link: `/assets/${a.id}`,
          ...(staffSide ? { owner: who[a.client_id] ?? a.owner_name ?? null } : {}),
          reminders: rs,
          recent_projects: (jobs ?? []).filter((j: any) => j.asset_id === a.id).slice(0, 5)
            .map((j: any) => ({ ref: j.ref, title: j.title, status: STATUS_LABEL[j.status] ?? j.status, link: `/projects/${j.id}` })),
        };
      });
      if (input.due_only) rows = rows.filter((r: any) => r.reminders.some((m: any) => m.state !== "scheduled")).slice(0, limitOf(input.limit));
      return { content: { assets: rows } };
    }

    case "get_workshop_contact": {
      const { data } = await db.from("workshop_settings_public").select("workshop_name, contact_email, phone, address").eq("id", 1).maybeSingle();
      return { content: data ?? notFound("workshop details") };
    }

    case "offer_message_to_workshop": {
      if (role !== "client") return { content: { error: "Only clients can use this." } };
      const p = await findProject(db, input.project);
      if (!p) return { content: notFound("project") };
      const message = String(input.message ?? "").trim().slice(0, 1000);
      if (!message) return { content: { error: "Write the message first." } };
      return {
        content: { ok: true, note: "The draft is shown to the client with a Send button. Tell them to check it and press Send." },
        draft: { project_id: p.id, project_ref: p.ref, project_title: p.title, message },
      };
    }
  }
  return { content: { error: `Unknown tool ${name}` } };
}
