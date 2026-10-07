import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";


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

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();

    // Admins and managers add clients from the Clients page. Reception can also register a
    // client who walks in, but only without portal access: an admin switches the portal on later.
    const isAdmin = !!roleData && ["admin", "manager"].includes(roleData.role);
    let canReception = false;
    if (!isAdmin) {
      const { data: allowed } = await anonClient.rpc("has_permission", { _user_id: callerId, _permission: "reception" });
      canReception = allowed === true;
    }
    if (!isAdmin && !canReception) {
      return new Response(JSON.stringify({ error: "Forbidden: admin, manager or reception access required" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!(await sessionVerified(authHeader))) {
      return new Response(JSON.stringify({ error: MFA_REQUIRED }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, full_name, phone, company_name, contact_person, address } = body;
    const portal = isAdmin ? body.portal !== false : false;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid email is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Company name is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await adminClient.rpc("provision_account", { _email: email, _role: "client" });
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    });

    if (createError) {
      const taken = /already (been )?registered|already exists/i.test(createError.message);
      return new Response(JSON.stringify({ error: taken ? "Someone with this email is already registered. If they're a client, pick them from the list." : createError.message }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Update profile with company fields
    if (newUser.user) {
      const profileUpdate: Record<string, string | null> = {};
      if (phone) profileUpdate.phone = phone;
      if (company_name) profileUpdate.company_name = company_name;
      if (contact_person) profileUpdate.contact_person = contact_person;
      if (address) profileUpdate.address = address;

      if (Object.keys(profileUpdate).length > 0) {
        await adminClient
          .from("profiles")
          .update(profileUpdate)
          .eq("id", newUser.user.id);
      }
    }

    // No portal: the same as "Turn portal off" on the Clients page, so they can't sign in yet.
    if (newUser.user && !portal) {
      await adminClient.from("profiles").update({ is_active: false }).eq("id", newUser.user.id);
      await adminClient.auth.admin.updateUserById(newUser.user.id, { ban_duration: "876600h" });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id, portal }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
