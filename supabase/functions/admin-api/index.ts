import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
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

function getPagination(url: URL) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50"), 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0"), 0);
  return { limit, offset };
}

function getDateRange(url: URL) {
  return { from: url.searchParams.get("from"), to: url.searchParams.get("to") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const secret = Deno.env.get("GLOBAL_ADMIN_SECRET");
    if (!secret) return err("Server misconfigured: missing admin secret", 500);
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      return err("Unauthorized", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
          .from("workshop_settings").select("*").limit(1).maybeSingle();
        if (error) return err(error.message, 500);
        return json(data);
      }

      // ==================== UPDATE CONFIG ====================
      case "update-config": {
        if (req.method !== "POST") return err("POST required", 405);
        const body = await req.json();
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
          .from("workshop_settings").update(updates).eq("id", body.id ?? 1);
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
          .from("user_roles").select("user_id, role");
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
          .from("user_roles").update({ role }).eq("user_id", user_id);
        if (error) return err(error.message, 500);
        return json({ success: true });
      }

      // ==================== TOGGLE USER ====================
      case "toggle-user": {
        if (req.method !== "POST") return err("POST required", 405);
        const { user_id, is_active } = await req.json();
        if (!user_id || typeof is_active !== "boolean") return err("user_id and is_active required");

        // Update profile flag
        const { error: profileErr } = await supabase
          .from("profiles").update({ is_active }).eq("id", user_id);
        if (profileErr) return err(profileErr.message, 500);

        // Enforce via Supabase Auth ban so deactivated users cannot log in
        const { error: authErr } = await supabase.auth.admin.updateUserById(user_id, {
          ban_duration: is_active ? "none" : "876600h", // "none" lifts ban; large value = permanent
        });
        if (authErr) return err(authErr.message, 500);

        return json({ success: true });
      }

      // ==================== JOBS ====================
      case "jobs": {
        const { limit, offset } = getPagination(url);
        const status = url.searchParams.get("status");
        const { from, to } = getDateRange(url);

        let query = supabase
          .from("jobs")
          .select("*, client:profiles!client_id(full_name, company_name), staff:profiles!assigned_staff_id(full_name)")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", to);

        const { data, error, count } = await query;
        if (error) return err(error.message, 500);
        return json({ data, total: count, limit, offset });
      }

      // ==================== INVOICES ====================
      case "invoices": {
        const { limit, offset } = getPagination(url);
        const status = url.searchParams.get("status");
        const { from, to } = getDateRange(url);

        let query = supabase
          .from("invoices")
          .select("*, client:profiles!client_id(full_name, company_name)")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", to);

        const { data, error } = await query;
        if (error) return err(error.message, 500);
        return json({ data, limit, offset });
      }

      // ==================== REVENUE ====================
      case "revenue": {
        const { data, error } = await supabase.rpc("get_monthly_revenue");
        if (error) return err(error.message, 500);
        return json(data);
      }

      // ==================== APPOINTMENTS ====================
      case "appointments": {
        const { limit, offset } = getPagination(url);
        const status = url.searchParams.get("status");
        const { from, to } = getDateRange(url);

        let query = supabase
          .from("appointments")
          .select("*, client:profiles!client_id(full_name, company_name)")
          .order("appointment_date", { ascending: false })
          .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (from) query = query.gte("appointment_date", from);
        if (to) query = query.lte("appointment_date", to);

        const { data, error } = await query;
        if (error) return err(error.message, 500);
        return json({ data, limit, offset });
      }

      // ==================== INVENTORY ====================
      case "inventory": {
        const { limit, offset } = getPagination(url);
        const category = url.searchParams.get("category");
        const lowStockOnly = url.searchParams.get("low_stock") === "true";

        let query = supabase
          .from("inventory_items")
          .select("*")
          .order("name")
          .range(offset, offset + limit - 1);

        if (category) query = query.eq("category", category);

        const { data, error } = await query;
        if (error) return err(error.message, 500);

        const items = lowStockOnly
          ? (data || []).filter((i) => i.quantity <= i.min_stock)
          : data;

        return json({ data: items, limit, offset });
      }

      // ==================== ACTIVITY LOGS ====================
      case "activity-logs": {
        const { limit, offset } = getPagination(url);
        const { from, to } = getDateRange(url);
        const table = url.searchParams.get("table");

        let query = supabase
          .from("activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (table) query = query.eq("table_name", table);
        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", to);

        const { data, error } = await query;
        if (error) return err(error.message, 500);
        return json({ data, limit, offset });
      }

      // ==================== ANALYTICS ====================
      case "analytics": {
        const [revenue, bookings, jobStats] = await Promise.all([
          supabase.rpc("get_monthly_revenue"),
          supabase.rpc("get_monthly_bookings"),
          supabase.rpc("get_job_completion_stats"),
        ]);

        return json({
          monthly_revenue: revenue.data ?? [],
          monthly_bookings: bookings.data ?? [],
          job_completion_stats: jobStats.data ?? [],
        });
      }

      // ==================== RATINGS ====================
      case "ratings": {
        const { limit, offset } = getPagination(url);

        const [ratingsRes, avgRes] = await Promise.all([
          supabase
            .from("job_ratings")
            .select("*, client:profiles!client_id(full_name, company_name), job:jobs!job_id(title)")
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1),
          supabase
            .from("job_ratings")
            .select("rating"),
        ]);

        if (ratingsRes.error) return err(ratingsRes.error.message, 500);

        const allRatings = avgRes.data || [];
        const avg = allRatings.length
          ? allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length
          : 0;

        return json({
          data: ratingsRes.data,
          average_rating: Math.round(avg * 100) / 100,
          total_ratings: allRatings.length,
          limit,
          offset,
        });
      }

      // ==================== STORAGE ====================
      case "storage": {
        const { data: attachments, error: attErr } = await supabase
          .from("job_attachments")
          .select("file_size, file_type");

        if (attErr) return err(attErr.message, 500);

        const files = attachments || [];
        const totalSize = files.reduce((sum, f) => sum + (f.file_size || 0), 0);
        const byType: Record<string, number> = {};
        files.forEach((f) => {
          byType[f.file_type || "unknown"] = (byType[f.file_type || "unknown"] || 0) + 1;
        });

        return json({
          total_files: files.length,
          total_size_bytes: totalSize,
          total_size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
          files_by_type: byType,
        });
      }

      // ==================== CREATE USER ====================
      case "create-user": {
        if (req.method !== "POST") return err("POST required", 405);
        const body = await req.json();
        const { email, full_name, phone, company_name, contact_person, address, role } = body;

        if (!email || typeof email !== "string" || !email.includes("@"))
          return err("Valid email is required");
        if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0)
          return err("Full name is required");

        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: full_name.trim() },
        });

        if (createError) return err(createError.message);

        if (newUser.user) {
          const profileUpdate: Record<string, string | null> = {};
          if (phone) profileUpdate.phone = phone;
          if (company_name) profileUpdate.company_name = company_name;
          if (contact_person) profileUpdate.contact_person = contact_person;
          if (address) profileUpdate.address = address;

          if (Object.keys(profileUpdate).length > 0) {
            await supabase.from("profiles").update(profileUpdate).eq("id", newUser.user.id);
          }

          if (role && ["admin", "manager", "staff", "client"].includes(role)) {
            await supabase.from("user_roles").update({ role }).eq("user_id", newUser.user.id);
          }
        }

        return json({ success: true, user_id: newUser.user.id });
      }

      // ==================== UPDATE VERSION ====================
      case "update-version": {
        if (req.method !== "POST") return err("POST required", 405);
        const { version } = await req.json();
        if (!version || typeof version !== "string") return err("version string required");

        const { error } = await supabase
          .from("workshop_settings")
          .update({ instance_version: version })
          .eq("id", 1);
        if (error) return err(error.message, 500);
        return json({ success: true, version });
      }

      // ==================== SEED DATA ====================
      case "seed-data": {
        if (req.method !== "POST") return err("POST required", 405);
        const { data: adminRoles } = await supabase
          .from("user_roles").select("user_id").eq("role", "admin").limit(1);
        if (!adminRoles?.length) return err("No admin user found in this instance", 500);
        const adminId = adminRoles[0].user_id;
        const { data: adminUser } = await supabase.auth.admin.getUserById(adminId);
        if (!adminUser?.user?.email) return err("Admin user has no email", 500);
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: "magiclink", email: adminUser.user.email,
        });
        if (linkErr || !linkData) return err("Failed to generate admin token: " + (linkErr?.message || "unknown"), 500);
        const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties?.hashed_token!, type: "magiclink",
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
          .from("user_roles").select("user_id").eq("role", "admin").limit(1);
        if (!adminRoles2?.length) return err("No admin user found in this instance", 500);
        const adminId2 = adminRoles2[0].user_id;
        const { data: adminUser2 } = await supabase.auth.admin.getUserById(adminId2);
        if (!adminUser2?.user?.email) return err("Admin user has no email", 500);
        const { data: linkData2, error: linkErr2 } = await supabase.auth.admin.generateLink({
          type: "magiclink", email: adminUser2.user.email,
        });
        if (linkErr2 || !linkData2) return err("Failed to generate admin token", 500);
        const { data: sessionData2, error: sessionErr2 } = await supabase.auth.verifyOtp({
          token_hash: linkData2.properties?.hashed_token!, type: "magiclink",
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

      // ==================== ENVIRONMENT / TROUBLESHOOT ====================
      case "environment": {
        // Collect environment variable names (never values) for troubleshooting
        const envKeys = Object.keys(Deno.env.toObject()).sort();

        // Check DB connectivity + table row counts
        const tables = [
          "jobs", "invoices", "appointments", "inventory_items",
          "profiles", "user_roles", "activity_logs", "notifications",
          "job_tasks", "job_attachments", "job_ratings", "job_updates",
          "job_task_notes", "inventory_transactions", "invoice_items",
          "workshop_settings",
        ];
        const tableCountResults: Record<string, number | string> = {};
        let dbConnected = true;
        try {
          const countPromises = tables.map(async (t) => {
            const { count, error } = await supabase
              .from(t)
              .select("id", { count: "exact", head: true });
            return { table: t, count: error ? `error: ${error.message}` : (count ?? 0) };
          });
          const counts = await Promise.all(countPromises);
          for (const c of counts) tableCountResults[c.table] = c.count;
        } catch {
          dbConnected = false;
        }

        // Check auth service
        let authStatus = "unknown";
        let totalAuthUsers = 0;
        try {
          const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
          if (authErr) {
            authStatus = `error: ${authErr.message}`;
          } else {
            authStatus = "ok";
            // listUsers returns total count in the response
            totalAuthUsers = (authList as any)?.total ?? (authList?.users?.length ?? 0);
          }
        } catch (e) {
          authStatus = `error: ${(e as Error).message}`;
        }

        // Check storage buckets
        let storageBuckets: { name: string; public: boolean }[] = [];
        let storageStatus = "unknown";
        try {
          const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
          if (bErr) {
            storageStatus = `error: ${bErr.message}`;
          } else {
            storageStatus = "ok";
            storageBuckets = (buckets || []).map((b) => ({ name: b.name, public: b.public }));
          }
        } catch (e) {
          storageStatus = `error: ${(e as Error).message}`;
        }

        // Check edge function reachability (self-ping)
        let edgeFunctionStatus = "ok";
        try {
          const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/admin-api?action=health`;
          const selfResp = await fetch(selfUrl, {
            headers: {
              Authorization: `Bearer ${secret}`,
              apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
            },
          });
          if (!selfResp.ok) edgeFunctionStatus = `error: status ${selfResp.status}`;
        } catch (e) {
          edgeFunctionStatus = `error: ${(e as Error).message}`;
        }

        // Workshop settings snapshot
        const { data: wsSettings } = await supabase
          .from("workshop_settings")
          .select("*")
          .limit(1)
          .maybeSingle();

        // RLS policy check — try a query as anon to see if RLS is enforced
        const anonClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!
        );
        let rlsEnforced = "unknown";
        try {
          const { count: rlsCount, error: rlsErr } = await anonClient
            .from("jobs")
            .select("id", { count: "exact", head: true });
          if (rlsErr) {
            rlsEnforced = "yes (query blocked)";
          } else {
            // Service role sees all rows; anon should see 0 if RLS is on
            const serviceCount = typeof tableCountResults["jobs"] === "number" ? tableCountResults["jobs"] : 0;
            const anonCount = rlsCount ?? 0;
            rlsEnforced = serviceCount > 0 && anonCount === 0
              ? "yes"
              : serviceCount === 0
                ? "no data to verify"
                : "possibly not enforced";
          }
        } catch {
          rlsEnforced = "yes (error)";
        }

        return json({
          timestamp: new Date().toISOString(),
          runtime: {
            deno_version: Deno.version?.deno ?? "unknown",
            v8_version: Deno.version?.v8 ?? "unknown",
            typescript_version: Deno.version?.typescript ?? "unknown",
          },
          supabase: {
            url: Deno.env.get("SUPABASE_URL") ?? "not set",
            project_ref: (Deno.env.get("SUPABASE_URL") ?? "").match(/https:\/\/([^.]+)/)?.[1] ?? "unknown",
          },
          services: {
            database: dbConnected ? "ok" : "error",
            auth: authStatus,
            auth_total_users: totalAuthUsers,
            storage: storageStatus,
            storage_buckets: storageBuckets,
            edge_functions: edgeFunctionStatus,
          },
          security: {
            rls_enforced_on_jobs: rlsEnforced,
            global_admin_secret_set: !!Deno.env.get("GLOBAL_ADMIN_SECRET"),
            service_role_key_set: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
          },
          environment_variables: envKeys,
          table_row_counts: tableCountResults,
          workshop_settings: wsSettings,
        });
      }

      // ==================== ENSURE SUPER ADMIN ====================
      case "ensure-super-admin": {
        if (req.method !== "POST") return err("POST required", 405);
        const { email, full_name, password } = await req.json();
        if (!email || typeof email !== "string" || !email.includes("@"))
          return err("Valid email is required");

        // Check if user already exists
        const { data: existingUsers, error: listErr } = await supabase.auth.admin.listUsers();
        if (listErr) return err(listErr.message, 500);

        const existing = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );

        let userId: string;
        let created = false;
        const validPassword = password && typeof password === "string" && password.length >= 6;

        if (existing) {
          userId = existing.id;
          // Update password if provided
          if (validPassword) {
            await supabase.auth.admin.updateUserById(userId, { password });
          }
        } else {
          const createOpts: any = {
            email,
            email_confirm: true,
            user_metadata: { full_name: full_name?.trim() || "Super Admin" },
          };
          if (validPassword) {
            createOpts.password = password;
          }
          const { data: newUser, error: createErr } = await supabase.auth.admin.createUser(createOpts);
          if (createErr) return err(createErr.message, 500);
          userId = newUser.user.id;
          created = true;
        }

        // Ensure admin role
        const { data: existingRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existingRole) {
          await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        } else if (existingRole.role !== "admin") {
          await supabase.from("user_roles").update({ role: "admin" }).eq("user_id", userId);
        }

        // Mark as super admin so instance UI hides this account
        await supabase
          .from("profiles")
          .update({ is_super_admin: true })
          .eq("id", userId);

        return json({ success: true, user_id: userId, email, created });
      }

      // ==================== GENERATE LOGIN LINK ====================
      case "generate-login-link": {
        if (req.method !== "POST") return err("POST required", 405);
        const { email } = await req.json();
        if (!email || typeof email !== "string" || !email.includes("@"))
          return err("Valid email is required");

        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        if (linkErr) return err(linkErr.message, 500);
        if (!linkData?.properties?.action_link) return err("Failed to generate login link", 500);

        return json({ success: true, link: linkData.properties.action_link });
      }

      // ==================== FEATURE FLAGS ====================
      case "get_feature_flags": {
        const { data, error: fetchErr } = await supabase
          .from("workshop_settings")
          .select("feature_flags")
          .eq("id", 1)
          .maybeSingle();
        if (fetchErr) return err(fetchErr.message, 500);
        return json({ flags: data?.feature_flags ?? {} });
      }

      case "set_feature_flags": {
        if (req.method !== "POST") return err("POST required", 405);
        const body = await req.json();
        const { flags } = body;
        if (!flags || typeof flags !== "object") return err("flags object required");
        const { error: updateErr } = await supabase
          .from("workshop_settings")
          .update({ feature_flags: flags })
          .eq("id", 1);
        if (updateErr) return err(updateErr.message, 500);
        return json({ ok: true });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (e) {
    return err((e as Error).message, 500);
  }
});
