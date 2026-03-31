import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: validate shared secret ---
    const authHeader = req.headers.get("Authorization");
    const secret = Deno.env.get("GLOBAL_ADMIN_SECRET");
    if (!secret) return err("Server misconfigured: missing admin secret", 500);

    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return err("Unauthorized", 401);
    }

    // --- Service-role client ---
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // --- Route by action ---
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    switch (action) {
      // ==================== HEALTH ====================
      case "health": {
        const { data: settings } = await supabase
          .from("workshop_settings")
          .select("instance_version, workshop_name")
          .limit(1)
          .maybeSingle();
        return json({
          status: "ok",
          version: settings?.instance_version ?? "1.0.0",
          workshop_name: settings?.workshop_name ?? null,
          timestamp: new Date().toISOString(),
        });
      }

      // ==================== STATS ====================
      case "stats": {
        const [jobs, users, appointments, invoices, inventory] = await Promise.all([
          supabase.from("jobs").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("appointments").select("id", { count: "exact", head: true }),
          supabase.from("invoices").select("id", { count: "exact", head: true }),
          supabase.from("inventory_items").select("id, quantity, min_stock"),
        ]);

        const inventoryItems = inventory.data || [];
        const lowStock = inventoryItems.filter((i) => i.quantity <= i.min_stock).length;

        return json({
          jobs: jobs.count ?? 0,
          users: users.count ?? 0,
          appointments: appointments.count ?? 0,
          invoices: invoices.count ?? 0,
          inventory_items: inventoryItems.length,
          low_stock_items: lowStock,
        });
      }

      // ==================== CONFIG ====================
      case "config": {
        const { data, error } = await supabase
          .from("workshop_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (error) return err(error.message, 500);
        return json(data);
      }

      // ==================== UPDATE CONFIG ====================
      case "update-config": {
        if (req.method !== "POST") return err("POST required", 405);
        const body = await req.json();

        // Only allow safe fields
        const allowed = [
          "workshop_name", "address", "phone", "contact_email", "logo_url",
          "login_image_url", "currency", "default_tax_rate", "from_email",
          "email_notifications_enabled", "notify_job_status",
          "notify_low_inventory", "notify_new_appointment",
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (key in body) updates[key] = body[key];
        }
        if (Object.keys(updates).length === 0) return err("No valid fields provided");

        const { error } = await supabase
          .from("workshop_settings")
          .update(updates)
          .eq("id", body.id ?? 1);
        if (error) return err(error.message, 500);
        return json({ success: true });
      }

      // ==================== USERS ====================
      case "users": {
        const { data: profiles, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, company_name, phone, is_active, created_at");
        if (pErr) return err(pErr.message, 500);

        const { data: roles, error: rErr } = await supabase
          .from("user_roles")
          .select("user_id, role");
        if (rErr) return err(rErr.message, 500);

        const roleMap = new Map<string, string>();
        for (const r of roles || []) roleMap.set(r.user_id, r.role);

        const users = (profiles || []).map((p) => ({
          ...p,
          role: roleMap.get(p.id) || "client",
        }));

        return json(users);
      }

      // ==================== UPDATE ROLE ====================
      case "update-role": {
        if (req.method !== "POST") return err("POST required", 405);
        const { user_id, role } = await req.json();
        if (!user_id || !role) return err("user_id and role required");

        const validRoles = ["admin", "manager", "staff", "client"];
        if (!validRoles.includes(role)) return err("Invalid role");

        const { error } = await supabase
          .from("user_roles")
          .update({ role })
          .eq("user_id", user_id);
        if (error) return err(error.message, 500);
        return json({ success: true });
      }

      // ==================== TOGGLE USER ====================
      case "toggle-user": {
        if (req.method !== "POST") return err("POST required", 405);
        const { user_id, is_active } = await req.json();
        if (!user_id || typeof is_active !== "boolean") return err("user_id and is_active required");

        const { error } = await supabase
          .from("profiles")
          .update({ is_active })
          .eq("id", user_id);
        if (error) return err(error.message, 500);
        return json({ success: true });
      }

      // ==================== SEED DATA ====================
      case "seed-data": {
        if (req.method !== "POST") return err("POST required", 405);

        // Find an admin user to act as caller for the seed function
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        if (!adminRoles?.length) return err("No admin user found in this instance", 500);

        const adminId = adminRoles[0].user_id;
        const { data: adminUser } = await supabase.auth.admin.getUserById(adminId);
        if (!adminUser?.user?.email) return err("Admin user has no email", 500);

        // Generate an OTP link to get a valid session token
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: adminUser.user.email,
        });
        if (linkErr || !linkData) return err("Failed to generate admin token: " + (linkErr?.message || "unknown"), 500);

        const token = linkData.properties?.hashed_token;
        // Verify the OTP to get a session
        const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
          token_hash: token!,
          type: "magiclink",
        });
        if (sessionErr || !sessionData?.session) return err("Failed to create admin session: " + (sessionErr?.message || "unknown"), 500);

        const seedUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/seed-data`;
        const resp = await fetch(seedUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          },
        });
        const result = await resp.json();
        return json(result, resp.status);
      }

      // ==================== DELETE DATA ====================
      case "delete-data": {
        if (req.method !== "POST") return err("POST required", 405);

        const { data: adminRoles2 } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1);
        if (!adminRoles2?.length) return err("No admin user found in this instance", 500);

        const adminId2 = adminRoles2[0].user_id;
        const { data: adminUser2 } = await supabase.auth.admin.getUserById(adminId2);
        if (!adminUser2?.user?.email) return err("Admin user has no email", 500);

        const { data: linkData2, error: linkErr2 } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: adminUser2.user.email,
        });
        if (linkErr2 || !linkData2) return err("Failed to generate admin token", 500);

        const { data: sessionData2, error: sessionErr2 } = await supabase.auth.verifyOtp({
          token_hash: linkData2.properties?.hashed_token!,
          type: "magiclink",
        });
        if (sessionErr2 || !sessionData2?.session) return err("Failed to create admin session", 500);

        const deleteUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/delete-data`;
        const resp = await fetch(deleteUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionData2.session.access_token}`,
            apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          },
        });
        const result = await resp.json();
        return json(result, resp.status);
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
