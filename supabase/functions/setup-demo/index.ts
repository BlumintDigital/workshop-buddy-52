import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEMO_USERS = [
  { email: "demo.admin@workshop.demo", full_name: "Demo Admin", role: "admin", password: "Admin1234" },
  { email: "demo.manager@workshop.demo", full_name: "Demo Manager", role: "manager", password: "Manager1234" },
  { email: "demo.staff@workshop.demo", full_name: "Demo Staff", role: "staff", password: "Staff1234" },
  { email: "demo.client@workshop.demo", full_name: "Demo Client", role: "client", password: "Client1234" },
] as const;

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

    const results: { email: string; role: string; created: boolean }[] = [];

    for (const demo of DEMO_USERS) {
      // Check if user already exists
      const { data: existing } = await adminClient.auth.admin.listUsers();
      const existingUser = existing?.users?.find(u => u.email === demo.email);

      if (existingUser) {
        // Update password to ensure it's correct
        await adminClient.auth.admin.updateUserById(existingUser.id, {
          password: demo.password,
          email_confirm: true,
        });
        // Ensure role is correct
        await adminClient.from("user_roles").upsert(
          { user_id: existingUser.id, role: demo.role },
          { onConflict: "user_id" }
        );
        results.push({ email: demo.email, role: demo.role, created: false });
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

        // Update profile
        await adminClient.from("profiles").update({ full_name: demo.full_name }).eq("id", newUser.user.id);

        // Assign role
        await adminClient.from("user_roles").upsert(
          { user_id: newUser.user.id, role: demo.role },
          { onConflict: "user_id" }
        );

        results.push({ email: demo.email, role: demo.role, created: true });
      }
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
