import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";


// These intentionally match the credentials used by src/pages/Demo.tsx.
const DEMO_USERS = [
  { email: "demo.admin@workshop.demo", password: "Admin1234", full_name: "Demo Admin", role: "admin" },
  { email: "demo.manager@workshop.demo", password: "Manager1234", full_name: "Demo Manager", role: "manager" },
  { email: "demo.staff@workshop.demo", password: "Staff1234", full_name: "Demo Staff", role: "staff" },
  { email: "demo.client@workshop.demo", password: "Client1234", full_name: "Demo Client", role: "client" },
] as const;

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

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();
    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: allUsers } = await adminClient.auth.admin.listUsers();
    const results: { email: string; role: string; created: boolean; roleSet: boolean; password: string }[] = [];

    for (const demo of DEMO_USERS) {
      const existingUser = allUsers?.users?.find((user) => user.email === demo.email);
      let userId: string;
      let created = false;

      if (existingUser) {
        userId = existingUser.id;
        const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
          password: demo.password,
          email_confirm: true,
          user_metadata: { full_name: demo.full_name },
        });
        if (updateError) {
          console.error(`Failed to reset ${demo.email}:`, updateError);
          continue;
        }
      } else {
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
      }

      await adminClient.from("profiles").update({ full_name: demo.full_name }).eq("id", userId);
      await adminClient.from("user_roles").delete().eq("user_id", userId);
      const { error: roleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: demo.role });

      results.push({ email: demo.email, role: demo.role, created, roleSet: !roleError, password: demo.password });
    }

    return new Response(
      JSON.stringify({
        success: true,
        users: results,
        notice: "Demo passwords and roles now match the one-click /demo page.",
      }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
