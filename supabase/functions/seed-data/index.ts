import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";


serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check caller is admin
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
      { name: "Brake Pads (Front)", sku: "BP-001", category: "Brakes", quantity: 24, min_stock: 10, unit_cost: 35.99, unit: "set" },
      { name: "Oil Filter", sku: "OF-002", category: "Filters", quantity: 50, min_stock: 20, unit_cost: 8.50, unit: "pcs" },
      { name: "Spark Plugs", sku: "SP-003", category: "Engine", quantity: 100, min_stock: 30, unit_cost: 4.25, unit: "pcs" },
      { name: "Air Filter", sku: "AF-004", category: "Filters", quantity: 30, min_stock: 10, unit_cost: 12.00, unit: "pcs" },
      { name: "Synthetic Motor Oil 5W-30", sku: "MO-005", category: "Fluids", quantity: 40, min_stock: 15, unit_cost: 28.99, unit: "qt" },
      { name: "Windshield Wipers", sku: "WW-006", category: "Exterior", quantity: 18, min_stock: 8, unit_cost: 15.50, unit: "pair" },
      { name: "Brake Rotor", sku: "BR-007", category: "Brakes", quantity: 12, min_stock: 4, unit_cost: 65.00, unit: "pcs" },
      { name: "Transmission Fluid", sku: "TF-008", category: "Fluids", quantity: 20, min_stock: 8, unit_cost: 18.75, unit: "qt" },
      { name: "Battery (12V)", sku: "BT-009", category: "Electrical", quantity: 8, min_stock: 3, unit_cost: 120.00, unit: "pcs" },
      { name: "Serpentine Belt", sku: "SB-010", category: "Engine", quantity: 15, min_stock: 5, unit_cost: 22.50, unit: "pcs" },
    ];

    const { data: insertedItems } = await adminClient.from("inventory_items").insert(inventoryItems).select("id");
    counts.inventory_items = insertedItems?.length || 0;
    const itemIds = (insertedItems || []).map((i) => i.id);

    // 2. Jobs
    const today = new Date();
    const dayMs = 86400000;
    const fmtDate = (d: Date) => d.toISOString().split("T")[0];

    const jobsData = [
      { title: "Full Brake Service", description: "Replace front and rear brake pads, resurface rotors", status: "completed", priority: "high", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 4, actual_hours: 3.5, due_date: fmtDate(new Date(today.getTime() - 5 * dayMs)) },
      { title: "Oil Change & Filter", description: "Synthetic oil change with new oil and air filter", status: "completed", priority: "low", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 1, actual_hours: 0.75, due_date: fmtDate(new Date(today.getTime() - 3 * dayMs)) },
      { title: "Engine Diagnostics", description: "Check engine light on, run full OBD-II scan", status: "in_progress", priority: "high", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 2, due_date: fmtDate(new Date(today.getTime() + 1 * dayMs)) },
      { title: "Tire Rotation & Balance", description: "Rotate all four tires and balance", status: "in_progress", priority: "medium", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 1.5, due_date: fmtDate(new Date(today.getTime() + 2 * dayMs)) },
      { title: "Transmission Flush", description: "Full transmission fluid flush and refill", status: "pending", priority: "medium", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 3, due_date: fmtDate(new Date(today.getTime() + 5 * dayMs)) },
      { title: "A/C Recharge", description: "Recharge air conditioning system, check for leaks", status: "pending", priority: "low", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 2, due_date: fmtDate(new Date(today.getTime() + 7 * dayMs)) },
      { title: "Serpentine Belt Replacement", description: "Replace worn serpentine belt", status: "quoted", priority: "medium", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 1.5, due_date: fmtDate(new Date(today.getTime() + 10 * dayMs)) },
      { title: "Battery Replacement", description: "Test and replace dead battery", status: "cancelled", priority: "high", client_id: pickClient(), assigned_staff_id: pickStaff(), estimated_hours: 0.5, due_date: fmtDate(new Date(today.getTime() - 1 * dayMs)) },
    ];

    const { data: insertedJobs } = await adminClient.from("jobs").insert(jobsData).select("id, status, client_id, assigned_staff_id");
    counts.jobs = insertedJobs?.length || 0;

    // 3. Job tasks
    const taskTemplates = [
      ["Inspect components", "Order parts", "Perform service", "Quality check"],
      ["Initial assessment", "Get customer approval", "Complete work", "Final test"],
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

    // 4. Job updates
    const jobUpdates: any[] = [];
    for (const job of insertedJobs || []) {
      jobUpdates.push({
        job_id: job.id,
        user_id: job.assigned_staff_id || callerId,
        status: "pending",
        notes: "Job created and assigned",
      });
      if (job.status !== "pending" && job.status !== "quoted") {
        jobUpdates.push({
          job_id: job.id,
          user_id: job.assigned_staff_id || callerId,
          status: job.status,
          notes: `Status updated to ${job.status}`,
        });
      }
    }
    const { data: insertedUpdates } = await adminClient.from("job_updates").insert(jobUpdates).select("id");
    counts.job_updates = insertedUpdates?.length || 0;

    // 5. Appointments
    const appointmentsData = [
      { title: "Vehicle Inspection", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 1 * dayMs)), appointment_time: "09:00", duration_minutes: 60, type: "inspection", status: "confirmed", description: "Annual vehicle inspection" },
      { title: "Oil Change Appointment", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 2 * dayMs)), appointment_time: "10:30", duration_minutes: 30, type: "service", status: "pending", description: "Quick oil change" },
      { title: "Brake Consultation", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 3 * dayMs)), appointment_time: "14:00", duration_minutes: 45, type: "consultation", status: "confirmed", description: "Discuss brake noise issue" },
      { title: "Tire Replacement", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() + 5 * dayMs)), appointment_time: "08:00", duration_minutes: 90, type: "service", status: "pending", description: "Replace all four tires" },
      { title: "Engine Check Follow-up", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() - 2 * dayMs)), appointment_time: "11:00", duration_minutes: 60, type: "consultation", status: "completed" },
      { title: "Warranty Service", client_id: pickClient(), appointment_date: fmtDate(new Date(today.getTime() - 5 * dayMs)), appointment_time: "13:00", duration_minutes: 120, type: "service", status: "cancelled" },
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

    // 6. Invoices (for completed jobs)
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

    // 7. Invoice items
    const invoiceItemsData: any[] = [];
    for (const inv of insertedInvoices || []) {
      invoiceItemsData.push(
        { invoice_id: inv.id, description: "Labor - Diagnostic & Repair", quantity: 2, unit_price: 75.00, total: 150.00 },
        { invoice_id: inv.id, description: "Parts - Replacement components", quantity: 1, unit_price: 45.00, total: 45.00 },
        { invoice_id: inv.id, description: "Shop supplies & disposal fee", quantity: 1, unit_price: 15.00, total: 15.00 },
      );
    }
    const { data: insertedInvItems } = await adminClient.from("invoice_items").insert(invoiceItemsData).select("id");
    counts.invoice_items = insertedInvItems?.length || 0;

    // 8. Inventory transactions
    const invTxns: any[] = [];
    for (let i = 0; i < Math.min(5, itemIds.length); i++) {
      invTxns.push({
        item_id: itemIds[i],
        type: "used",
        quantity: -2,
        user_id: pickStaff() || callerId,
        job_id: (insertedJobs || [])[0]?.id || null,
        notes: "Used for service job",
      });
      invTxns.push({
        item_id: itemIds[i],
        type: "restock",
        quantity: 10,
        user_id: pickAdmin(),
        notes: "Monthly restock",
      });
    }
    const { data: insertedTxns } = await adminClient.from("inventory_transactions").insert(invTxns).select("id");
    counts.inventory_transactions = insertedTxns?.length || 0;

    // 9. Notifications
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
