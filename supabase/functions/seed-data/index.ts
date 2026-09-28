import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { isServiceCall, MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";


serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // admin-api (the operator's command centre) calls with the service key and
    // names the admin it acts for; everyone else is a signed-in admin.
    let callerId: string;
    if (isServiceCall(authHeader)) {
      callerId = req.headers.get("x-acting-user") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(callerId)) {
        return new Response(JSON.stringify({ error: "x-acting-user must name an admin" }), {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    } else {
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      callerId = claimsData.claims.sub as string;
      if (!(await sessionVerified(authHeader))) {
        return new Response(JSON.stringify({ error: MFA_REQUIRED }), {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Fetch existing users by role
    const { data: allRoles } = await adminClient.from("user_roles").select("user_id, role");
    const clientIds = (allRoles || []).filter((r) => r.role === "client").map((r) => r.user_id);
    const staffIds = (allRoles || []).filter((r) => r.role === "staff").map((r) => r.user_id);
    const adminIds = (allRoles || []).filter((r) => r.role === "admin").map((r) => r.user_id);
    const managerIds = (allRoles || []).filter((r) => r.role === "manager").map((r) => r.user_id);

    // Use caller as fallback for any role
    const pickClient = () => clientIds.length > 0 ? clientIds[Math.floor(Math.random() * clientIds.length)] : callerId;
    const pickStaff = () => staffIds.length > 0 ? staffIds[Math.floor(Math.random() * staffIds.length)] : callerId;
    const pickAdmin = () => adminIds.length > 0 ? adminIds[0] : callerId;

    const counts: Record<string, number> = {};

    // 1. Inventory items
    const inventoryItems = [
      { name: "Deep groove bearing 6204-2RS", sku: "BRG-6204", category: "Bearings", quantity: 24, min_stock: 10, unit_cost: 6.50, unit: "pcs" },
      { name: "Taper roller bearing 30206", sku: "BRG-30206", category: "Bearings", quantity: 12, min_stock: 4, unit_cost: 18.00, unit: "pcs" },
      { name: "Oil seal 35x52x7", sku: "SEAL-3552", category: "Seals", quantity: 40, min_stock: 15, unit_cost: 2.40, unit: "pcs" },
      { name: "Mechanical seal 25 mm", sku: "SEAL-M25", category: "Seals", quantity: 6, min_stock: 3, unit_cost: 45.00, unit: "pcs" },
      { name: "Enamelled copper wire 1.0 mm", sku: "CW-100", category: "Motor rewind", quantity: 20, min_stock: 8, unit_cost: 38.00, unit: "kg" },
      { name: "MIG wire ER70S-6 0.8 mm", sku: "MIG-08", category: "Welding", quantity: 15, min_stock: 5, unit_cost: 22.50, unit: "spool" },
      { name: "Mild steel plate 6 mm", sku: "MS-P6", category: "Steel", quantity: 30, min_stock: 10, unit_cost: 42.00, unit: "sheet" },
      { name: "Hydraulic oil ISO 46", sku: "HO-46", category: "Fluids", quantity: 40, min_stock: 15, unit_cost: 4.20, unit: "litre" },
      { name: "V-belt SPA 1250", sku: "VB-1250", category: "Drives", quantity: 18, min_stock: 6, unit_cost: 11.75, unit: "pcs" },
      { name: "Grinding disc 115 mm", sku: "GD-115", category: "Consumables", quantity: 100, min_stock: 30, unit_cost: 1.10, unit: "pcs" },
    ];

    const { data: insertedItems } = await adminClient.from("inventory_items").insert(inventoryItems).select("id");
    counts.inventory_items = insertedItems?.length || 0;
    const itemIds = (insertedItems || []).map((i) => i.id);

    // 2. Jobs
    const today = new Date();
    const dayMs = 86400000;
    const fmtDate = (d: Date) => d.toISOString().split("T")[0];

    const jobsData = [
      { title: "Lathe spindle bearing replacement", description: "Headstock bearings noisy at speed; replace bearings and seals, check runout", status: "completed", priority: "high", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 4, actual_hours: 3.5, due_date: fmtDate(new Date(today.getTime() - 5 * dayMs)) },
      { title: "Gearbox overhaul", description: "Conveyor gearbox leaking oil; strip, replace seals and bearings, refill", status: "completed", priority: "low", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 1, actual_hours: 0.75, due_date: fmtDate(new Date(today.getTime() - 3 * dayMs)) },
      { title: "Electric motor rewind", description: "7.5 kW motor tripping; test windings and rewind the stator", status: "in_progress", priority: "high", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 2, due_date: fmtDate(new Date(today.getTime() + 1 * dayMs)) },
      { title: "Hydraulic press cylinder reseal", description: "Cylinder losing pressure; replace seals and test to 200 bar", status: "in_progress", priority: "medium", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 1.5, due_date: fmtDate(new Date(today.getTime() + 2 * dayMs)) },
      { title: "Fabricate machine guard", description: "Mild steel bandsaw guard to drawing, powder coated", status: "pending", priority: "medium", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 3, due_date: fmtDate(new Date(today.getTime() + 5 * dayMs)) },
      { title: "Pump impeller repair", description: "Worn impeller and leaking mechanical seal on a centrifugal pump", status: "pending", priority: "low", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 2, due_date: fmtDate(new Date(today.getTime() + 7 * dayMs)) },
      { title: "CNC axis servo fault", description: "Y axis servo alarm; diagnose the drive and motor", status: "quote", priority: "medium", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 1.5, due_date: fmtDate(new Date(today.getTime() + 10 * dayMs)) },
      { title: "Air compressor service", description: "Service and pressure test; the customer cancelled", status: "cancelled", priority: "high", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 0.5, due_date: fmtDate(new Date(today.getTime() - 1 * dayMs)) },
    ];

    const { data: insertedJobs } = await adminClient.from("jobs").insert(jobsData).select("id, status, client_id, assigned_staff_id");
    counts.jobs = insertedJobs?.length || 0;

    // 3. Job tasks
    const taskTemplates = [
      ["Strip and inspect", "Order parts", "Repair and reassemble", "Test run"],
      ["Initial assessment", "Quote and approval", "Carry out the work", "Final test"],
    ];
    const jobTasks: any[] = [];
    for (const job of insertedJobs || []) {
      const template = taskTemplates[Math.floor(Math.random() * taskTemplates.length)];
      const numTasks = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < numTasks && i < template.length; i++) {
        jobTasks.push({
          job_id: job.id,
          title: template[i],
          status: job.status === "completed" ? "completed" : i === 0 ? "in_progress" : "pending",
          assigned_to: job.assigned_staff_id,
        });
      }
    }
    const { data: insertedTasks } = await adminClient.from("job_tasks").insert(jobTasks).select("id");
    counts.job_tasks = insertedTasks?.length || 0;

    // 4. Appointments
    const appointmentsData = [
      { title: "Site survey: conveyor line", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 1 * dayMs)), appointment_time: "09:00", duration_minutes: 60, type: "inspection", status: "confirmed", description: "Measure up and assess the conveyor drive" },
      { title: "Motor drop-off", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 2 * dayMs)), appointment_time: "10:30", duration_minutes: 30, type: "repair", status: "pending", description: "Customer bringing in a 7.5 kW motor" },
      { title: "Quote review: gearbox", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 3 * dayMs)), appointment_time: "14:00", duration_minutes: 45, type: "consultation", status: "confirmed", description: "Go through the gearbox overhaul quote" },
      { title: "Press cylinder repair on site", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 5 * dayMs)), appointment_time: "08:00", duration_minutes: 90, type: "repair", status: "pending", description: "Reseal the cylinder at the customer's site" },
      { title: "Follow-up: CNC servo", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() - 2 * dayMs)), appointment_time: "11:00", duration_minutes: 60, type: "consultation", status: "completed" },
      { title: "Compressor service", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() - 5 * dayMs)), appointment_time: "13:00", duration_minutes: 120, type: "repair", status: "cancelled" },
    ];

    const { data: appointmentsFlag } = await adminClient
      .from("feature_flags")
      .select("enabled")
      .eq("key", "appointments")
      .maybeSingle();
    if (appointmentsFlag?.enabled ?? true) {
      const { data: insertedAppts } = await adminClient.from("appointments").insert(appointmentsData).select("id");
      counts.appointments = insertedAppts?.length || 0;
    } else {
      counts.appointments = 0;
    }

    // 5. Invoices (for completed jobs)
    const completedJobs = (insertedJobs || []).filter((j) => j.status === "completed");
    const invoicesData = completedJobs.map((job, idx) => ({
      invoice_number: `INV-SAMPLE-${String(idx + 1).padStart(3, "0")}`,
      client_id: job.client_id,
      job_id: job.id,
      status: idx === 0 ? "paid" : "sent",
      subtotal: idx === 0 ? 250.00 : 85.00,
      tax_rate: 8.5,
      tax_amount: idx === 0 ? 21.25 : 7.23,
      total: idx === 0 ? 271.25 : 92.23,
      due_date: fmtDate(new Date(today.getTime() + 30 * dayMs)),
      paid_at: idx === 0 ? new Date(today.getTime() - 2 * dayMs).toISOString() : null,
    }));

    // Add a couple standalone invoices
    invoicesData.push({
      invoice_number: "INV-SAMPLE-003",
      client_id: pickClient(),
      job_id: null,
      status: "draft",
      subtotal: 450.00,
      tax_rate: 8.5,
      tax_amount: 38.25,
      total: 488.25,
      due_date: fmtDate(new Date(today.getTime() + 30 * dayMs)),
      paid_at: null,
    });
    invoicesData.push({
      invoice_number: "INV-SAMPLE-004",
      client_id: pickClient(),
      job_id: null,
      status: "overdue",
      subtotal: 175.00,
      tax_rate: 8.5,
      tax_amount: 14.88,
      total: 189.88,
      due_date: fmtDate(new Date(today.getTime() - 10 * dayMs)),
      paid_at: null,
    });

    const { data: insertedInvoices } = await adminClient.from("invoices").insert(invoicesData).select("id");
    counts.invoices = insertedInvoices?.length || 0;

    // 6. Invoice items
    const invoiceItemsData: any[] = [];
    for (const inv of insertedInvoices || []) {
      invoiceItemsData.push(
        { invoice_id: inv.id, description: "Labour: diagnosis and repair", quantity: 2, unit_price: 75.00, total: 150.00 },
        { invoice_id: inv.id, description: "Parts: replacement components", quantity: 1, unit_price: 45.00, total: 45.00 },
        { invoice_id: inv.id, description: "Workshop consumables", quantity: 1, unit_price: 15.00, total: 15.00 },
      );
    }
    const { data: insertedInvItems } = await adminClient.from("invoice_items").insert(invoiceItemsData).select("id");
    counts.invoice_items = insertedInvItems?.length || 0;

    // 7. Inventory transactions
    const invTxns: any[] = [];
    for (let i = 0; i < Math.min(5, itemIds.length); i++) {
      invTxns.push({
        item_id: itemIds[i],
        type: "out",
        quantity: 2,
        user_id: pickStaff() || callerId,
        job_id: (insertedJobs || [])[0]?.id || null,
        notes: "Issued to a repair",
      });
      invTxns.push({
        item_id: itemIds[i],
        type: "in",
        quantity: 10,
        user_id: pickAdmin(),
        notes: "Monthly restock",
      });
    }
    const { data: insertedTxns } = await adminClient.from("inventory_transactions").insert(invTxns).select("id");
    counts.inventory_transactions = insertedTxns?.length || 0;

    // 8. Notifications
    const notifTargets = [...clientIds.slice(0, 2), ...staffIds.slice(0, 1), callerId];
    const notifs = notifTargets.map((uid) => ({
      user_id: uid,
      title: "Sample Notification",
      message: "This is a sample notification generated for testing purposes.",
      read: false,
      link: "/",
    }));
    const { data: insertedNotifs } = await adminClient.from("notifications").insert(notifs).select("id");
    counts.notifications = insertedNotifs?.length || 0;

    return new Response(JSON.stringify({ success: true, counts }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
