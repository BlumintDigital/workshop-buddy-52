import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://ieq.shoplane.uk",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEMO_USERS = [
  { email: "demo.admin@workshop.demo", full_name: "Demo Admin", role: "admin" },
  { email: "demo.manager@workshop.demo", full_name: "Demo Manager", role: "manager" },
  { email: "demo.staff@workshop.demo", full_name: "Demo Staff", role: "staff" },
  { email: "demo.client@workshop.demo", full_name: "Demo Client", role: "client" },
] as const;

// Generate a strong random password (no hardcoded credentials in source).
function generatePassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  // Base64-url-ish, strip padding/symbols; ensure length >= 20
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "A").replace(/\//g, "B").replace(/=/g, "");
  return `Wb!${b64}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await anonClient.from("user_roles").select("role").eq("user_id", caller.id).maybeSingle();
    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: { email: string; role: string; created: boolean; roleSet: boolean }[] = [];

    // Fetch all users once
    const { data: allUsers } = await adminClient.auth.admin.listUsers();

    for (const demo of DEMO_USERS) {
      const existingUser = allUsers?.users?.find(u => u.email === demo.email);
      let userId: string;
      let created = false;

      if (existingUser) {
        userId = existingUser.id;
        // Reset password
        await adminClient.auth.admin.updateUserById(userId, {
          password: demo.password,
          email_confirm: true,
        });
      } else {
        // Create new user
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: demo.email,
          password: demo.password,
          email_confirm: true,
          user_metadata: { full_name: demo.full_name },
        });

        if (createError || !newUser?.user) {
          console.error(`Failed to create ${demo.email}:`, createError);
          continue;
        }

        userId = newUser.user.id;
        created = true;

        // Update profile name
        await adminClient.from("profiles").update({ full_name: demo.full_name }).eq("id", userId);
      }

      // Force-set role: delete existing row then insert correct one
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      const { error: roleError } = await adminClient.from("user_roles").insert({ user_id: userId, role: demo.role });

      results.push({ email: demo.email, role: demo.role, created, roleSet: !roleError });
    }

    return new Response(
      JSON.stringify({ success: true, users: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
