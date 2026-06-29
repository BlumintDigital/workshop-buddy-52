import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

const VALID_ROLES = ["admin", "manager", "staff", "client"] as const;
type Role = (typeof VALID_ROLES)[number];

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) {
      console.error("admin-create-user: missing env vars");
      return json({ error: "Server configuration error" }, 500);
    }

    const anonClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("admin-create-user: claims error", claimsError?.message);
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: callerRole, error: roleLookupError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();

    if (roleLookupError) {
      console.error("admin-create-user: role lookup failed", roleLookupError.message);
      return json({ error: "Role lookup failed" }, 500);
    }
    if (!callerRole || !["admin", "manager"].includes(callerRole.role)) {
      return json({ error: "Forbidden: admin or manager role required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const full_name = String(body.full_name ?? "").trim();
    const role = String(body.role ?? "") as Role;
    const phone =
      typeof body.phone === "string" ? body.phone.trim() : undefined;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      return json({ error: "Valid email is required" }, 400);
    }
    if (!full_name || full_name.length > 100) {
      return json({ error: "Full name is required (max 100 chars)" }, 400);
    }
    if (!VALID_ROLES.includes(role)) {
      return json({ error: "Invalid role" }, 400);
    }

    // Privilege guardrail: only admin can create admin or manager
    if (
      (role === "admin" || role === "manager") &&
      callerRole.role !== "admin"
    ) {
      return json({ error: `Only admins can create ${role} accounts` }, 403);
    }

    // Create the user (auto-confirmed; they'll set password via recovery link)
    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name, role },
      });

    if (createError || !newUser?.user) {
      console.error("admin-create-user: createUser failed", createError?.message);
      return json(
        { error: createError?.message ?? "Failed to create user" },
        400,
      );
    }

    const newUserId = newUser.user.id;

    // Upsert role (trigger may have inserted 'client' by default)
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert(
        { user_id: newUserId, role },
        { onConflict: "user_id" },
      );
    if (roleError) {
      console.error("admin-create-user: role upsert failed", roleError.message);
      return json(
        { error: `Created user but role failed: ${roleError.message}` },
        500,
      );
    }

    const profileUpdate: Record<string, unknown> = {
      invited_at: new Date().toISOString(),
    };
    if (phone) profileUpdate.phone = phone;
    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", newUserId);
    if (profileError) {
      console.warn("admin-create-user: profile update warn", profileError.message);
    }

    // Send a password-set / recovery email. Non-fatal: account already exists.
    try {
      const { error: linkError } = await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (linkError) {
        console.warn("admin-create-user: generateLink warn", linkError.message);
      }
    } catch (e) {
      console.warn("admin-create-user: generateLink threw", (e as Error).message);
    }

    return json({ success: true, user_id: newUserId });
  } catch (err) {
    console.error("admin-create-user: unhandled", (err as Error).message);
    await captureEdgeError(err, "admin-create-user");
    return json({ error: (err as Error).message }, 500);
  }
});
