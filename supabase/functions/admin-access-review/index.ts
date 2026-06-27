import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/mfa-cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return json({ error: "GET or POST required" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: callerRole, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleErr) return json({ error: roleErr.message }, 500);
    if (callerRole?.role !== "admin") {
      return json({ error: "Forbidden: admin role required" }, 403);
    }

    const [{ data: profiles, error: profilesErr }, { data: roles, error: rolesErr }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("id, full_name, created_at, is_active, is_super_admin, last_sign_in_at"),
        admin
          .from("user_roles")
          .select("user_id, role"),
      ]);

    if (profilesErr) return json({ error: profilesErr.message }, 500);
    if (rolesErr) return json({ error: rolesErr.message }, 500);

    const authUsers = await listAllAuthUsers(admin);
    const authMap = new Map(authUsers.map((user: any) => [user.id, user]));
    const roleMap = new Map((roles ?? []).map((role: any) => [role.user_id, role.role]));

    const users = (profiles ?? []).map((profile: any) => {
      const authUser = authMap.get(profile.id);
      return {
        user_id: profile.id,
        full_name: profile.full_name ?? null,
        email: authUser?.email ?? null,
        role: roleMap.get(profile.id) ?? "client",
        is_active: profile.is_active !== false,
        is_super_admin: profile.is_super_admin === true,
        last_sign_in_at: profile.last_sign_in_at ?? authUser?.last_sign_in_at ?? null,
        created_at: profile.created_at ?? authUser?.created_at ?? "",
      };
    });

    return json({ data: users, total: users.length });
  } catch (e) {
    console.error("admin-access-review error:", e);
    return json({ error: "Internal server error" }, 500);
  }
});

async function listAllAuthUsers(admin: any) {
  const perPage = 1000;
  const users: any[] = [];

  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const pageUsers = data?.users ?? [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
  }

  return users;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
