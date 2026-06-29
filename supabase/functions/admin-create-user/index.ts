import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

const VALID_ROLES = ["admin", "manager", "staff", "client"] as const;
type Role = (typeof VALID_ROLES)[number];

const friendlyCreateError = (message?: string) => {
  const lower = (message ?? "").toLowerCase();
  if (lower.includes("already") || lower.includes("email_exists")) {
    return "A user with this email already exists. Open their profile, resend the invite, or use a different email address.";
  }
  return message ?? "Failed to create user";
};

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
    if (!callerRole || callerRole.role !== "admin") {
      return json({ error: "Forbidden: admin role required" }, 403);
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

    // Create the user and send Supabase's invite email so they can set a password.
    const { data: newUser, error: createError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role },
      });

    if (createError || !newUser?.user) {
      console.error("admin-create-user: createUser failed", createError?.message);
      return json(
        { error: friendlyCreateError(createError?.message) },
        400,
      );
    }

    const newUserId = newUser.user.id;

    const { error: initialProfileError } = await adminClient
      .from("profiles")
      .upsert({
        id: newUserId,
        full_name,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    if (initialProfileError) {
      console.error("admin-create-user: profile setup failed", initialProfileError.message);
      await adminClient.auth.admin.deleteUser(newUserId).catch((cleanupError) => {
        console.error("admin-create-user: cleanup failed", cleanupError.message);
      });
      return json(
        { error: `User creation was rolled back because profile setup failed: ${initialProfileError.message}` },
        500,
      );
    }

    // Assign exactly one role without relying on a non-existent UNIQUE(user_id) constraint.
    const { error: roleError } = await adminClient.rpc("admin_set_user_role", {
      _caller_user_id: callerId,
      _target_user_id: newUserId,
      _role: role,
    });
    if (roleError) {
      console.error("admin-create-user: role assignment failed", roleError.message);
      await adminClient.auth.admin.deleteUser(newUserId).catch((cleanupError) => {
        console.error("admin-create-user: cleanup failed", cleanupError.message);
      });
      return json(
        { error: `User creation was rolled back because role assignment failed: ${roleError.message}` },
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
      console.error("admin-create-user: profile update failed", profileError.message);
      await adminClient.auth.admin.deleteUser(newUserId).catch((cleanupError) => {
        console.error("admin-create-user: cleanup failed", cleanupError.message);
      });
      return json(
        { error: `User creation was rolled back because profile setup failed: ${profileError.message}` },
        500,
      );
    }

    return json({ success: true, user_id: newUserId });
  } catch (err) {
    console.error("admin-create-user: unhandled", (err as Error).message);
    await captureEdgeError(err, "admin-create-user");
    return json({ error: (err as Error).message }, 500);
  }
});
