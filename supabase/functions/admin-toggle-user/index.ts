import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: buildCorsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller's JWT and confirm admin role
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleRow?.role !== "admin") {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    // Parse and validate request body
    if (req.method !== "POST") return json({ error: "POST required" }, 405);
    const { user_id, is_active } = await req.json();
    if (!user_id || typeof is_active !== "boolean") {
      return json({ error: "user_id (string) and is_active (boolean) are required" }, 400);
    }

    // Prevent self-deactivation
    if (user_id === caller.id) {
      return json({ error: "Cannot deactivate your own account" }, 400);
    }

    // Block deactivation of super admins
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("is_super_admin, full_name")
      .eq("id", user_id)
      .maybeSingle();

    if (targetProfile?.is_super_admin) {
      return json({ error: "Cannot deactivate a super admin account" }, 400);
    }

    // Update profile flag
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ is_active })
      .eq("id", user_id);
    if (profileErr) return json({ error: profileErr.message }, 500);

    // Enforce via Supabase Auth ban so deactivated users cannot sign in
    const { error: authErr } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: is_active ? "none" : "876600h",
    });
    if (authErr) return json({ error: authErr.message }, 500);

    // Audit log
    await admin.from("activity_logs").insert({
      action: "updated",
      table_name: "profiles",
      record_id: user_id,
      user_id: caller.id,
      summary: `User "${targetProfile?.full_name ?? user_id}" ${is_active ? "activated" : "deactivated"} by admin`,
      details: { user_id, is_active, activated_by: caller.id },
    });

    return json({ ok: true, user_id, is_active });
  } catch (e) {
    console.error("admin-toggle-user error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
  });
}
