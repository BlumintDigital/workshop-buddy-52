import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerRole?.role !== "admin") {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    if (req.method !== "POST") return json({ error: "POST required" }, 405);
    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return json({ error: "user_id (string) is required" }, 400);
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return json({ error: "Cannot delete your own account" }, 400);
    }

    // Fetch target profile
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("is_super_admin, full_name")
      .eq("id", user_id)
      .maybeSingle();

    if (targetProfile?.is_super_admin) {
      return json({ error: "Cannot delete a super admin account" }, 400);
    }

    // Block deletion of other admin-role users
    const { data: targetRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id)
      .maybeSingle();

    if (targetRole?.role === "admin") {
      return json({ error: "Cannot delete another admin account" }, 400);
    }

    // Hard-delete via Auth admin API (cascades to profiles and user_roles)
    const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id);

    if (deleteErr) {
      // FK violation: user has associated records that block deletion
      if (deleteErr.message?.toLowerCase().includes("foreign key") || deleteErr.message?.toLowerCase().includes("violates")) {
        return json({ error: "User has existing records (jobs, invoices, etc.) and cannot be deleted. Deactivate the account instead." }, 409);
      }
      return json({ error: deleteErr.message }, 500);
    }

    // Audit log
    await admin.from("activity_logs").insert({
      action: "deleted",
      table_name: "profiles",
      record_id: user_id,
      user_id: caller.id,
      summary: `User "${targetProfile?.full_name ?? user_id}" deleted by admin`,
      details: { deleted_user_id: user_id, deleted_by: caller.id },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("admin-delete-user error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
