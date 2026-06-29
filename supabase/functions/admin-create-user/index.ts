import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureEdgeError } from "../_shared/sentry.ts";


const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "*")
  .split(",")
  .map((s) => s.trim());

function corsHeaders(origin: string | null) {
  const allow =
    !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)
      ? origin ?? "*"
      : allowedOrigins[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const VALID_ROLES = ["admin", "manager", "staff", "client"] as const;
type Role = (typeof VALID_ROLES)[number];

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
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

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();

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
      return json(
        { error: `Only admins can create ${role} accounts` },
        403,
      );
    }

    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name, role },
      });

    if (createError || !newUser?.user) {
      return json(
        { error: createError?.message ?? "Failed to create user" },
        400,
      );
    }

    // Upsert role (trigger may have inserted 'client' by default)
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert(
        { user_id: newUser.user.id, role },
        { onConflict: "user_id" },
      );
    if (roleError) {
      return json({ error: `Created user but role failed: ${roleError.message}` }, 500);
    }

    const profileUpdate: Record<string, unknown> = { invited_at: new Date().toISOString() };
    if (phone) profileUpdate.phone = phone;
    await adminClient.from("profiles").update(profileUpdate).eq("id", newUser.user.id);

    // Send invite email so the user can set their password
    try {
      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name, role },
      });
      if (inviteError) {
        // Fallback: generate recovery link (sends recovery email via SMTP)
        await adminClient.auth.admin.generateLink({ type: "recovery", email });
      }
    } catch (_) {
      try { await adminClient.auth.admin.generateLink({ type: "recovery", email }); } catch (_) {}
    }

    return json({ success: true, user_id: newUser.user.id });
  } catch (err) {
    await captureEdgeError(err, "admin-create-user");
    return json({ error: (err as Error).message }, 500);
  }
});
