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

    // Parse request body for optional reset_users flag
    let resetUsers = false;
    try {
      const body = await req.json();
      resetUsers = body?.reset_users === true;
    } catch {
      // No body or invalid JSON — default to false
    }

    // Projects, stock, billing and appointments go in one transaction, so a
    // failure leaves everything as it was. A full reset also clears teams,
    // access, rates, goals and saved reports.
    const { data: counts, error: resetError } = await adminClient.rpc("reset_workshop_data", {
      _full: resetUsers,
      _keep_user: callerId,
    });
    if (resetError) {
      return new Response(JSON.stringify({ error: `Reset failed: ${resetError.message}` }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const deleted: Record<string, number> = { ...(counts as Record<string, number>) };

    // If factory reset requested, also delete users, roles, profiles, activity logs, and reset settings
    if (resetUsers) {
      // Clear activity logs
      const { data: logRows } = await adminClient.from("activity_logs").select("id");
      deleted["activity_logs"] = logRows?.length || 0;
      if (deleted["activity_logs"] > 0) {
        await adminClient.from("activity_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      }

      // Delete user_roles except caller's
      const { data: roleRows } = await adminClient
        .from("user_roles")
        .select("id, user_id")
        .neq("user_id", callerId);
      deleted["user_roles"] = roleRows?.length || 0;
      if (deleted["user_roles"] > 0) {
        await adminClient.from("user_roles").delete().neq("user_id", callerId);
      }

      // Delete profiles except caller's
      const { data: profileRows } = await adminClient
        .from("profiles")
        .select("id")
        .neq("id", callerId);
      deleted["profiles"] = profileRows?.length || 0;
      if (deleted["profiles"] > 0) {
        await adminClient.from("profiles").delete().neq("id", callerId);
      }

      // Delete auth users except caller
      let deletedUsers = 0;
      let page = 1;
      const perPage = 100;
      while (true) {
        const { data: userList, error: listErr } = await adminClient.auth.admin.listUsers({
          page,
          perPage,
        });
        if (listErr || !userList?.users?.length) break;

        const toDelete = userList.users.filter((u: any) => u.id !== callerId);
        await Promise.all(toDelete.map((u: any) => adminClient.auth.admin.deleteUser(u.id)));
        deletedUsers += toDelete.length;

        if (userList.users.length < perPage) break;
        page++;
      }
      deleted["auth_users"] = deletedUsers;

      // Reset workshop_settings to defaults (keep the row)
      await adminClient.from("workshop_settings").update({
        workshop_name: null,
        contact_email: null,
        phone: null,
        address: null,
        default_tax_rate: 0,
        monthly_goal: null,
        currency: "USD",
        project_ref_prefix: "EDL",
        purchase_manager_limit: 1000,
        overhead_percent: 15,
        notify_job_status: true,
        notify_new_appointment: true,
        notify_low_inventory: true,
        email_notifications_enabled: false,
        from_email: null,
        login_image_url: null,
        logo_url: null,
      }).eq("id", 1);

      // Reset admin-only contacts (super admin email, VAPID keys)
      await (adminClient.from("workshop_admin_contacts") as any).upsert({
        id: 1,
        super_admin_email: null,
        vapid_public_key: null,
      });
    }

    return new Response(JSON.stringify({ success: true, deleted }), {
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
