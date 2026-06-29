import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";

const COOLDOWN_SECONDS = 60;

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
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
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
    const userId = String(body.user_id ?? "").trim();
    if (!userId) return json({ error: "user_id is required" }, 400);

    const { data: targetRoleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const targetRole = targetRoleRow?.role;
    if (callerRole.role === "manager" && (targetRole === "admin" || targetRole === "manager")) {
      return json({ error: "Managers cannot resend invites for admin or manager accounts" }, 403);
    }

    // Cooldown check
    const { data: profile } = await adminClient
      .from("profiles")
      .select("invited_at, invite_accepted_at")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.invite_accepted_at) {
      return json({ error: "This user already accepted the invite" }, 400);
    }
    if (profile?.invited_at) {
      const last = new Date(profile.invited_at).getTime();
      const elapsed = (Date.now() - last) / 1000;
      if (elapsed < COOLDOWN_SECONDS) {
        return json(
          { error: `Please wait ${Math.ceil(COOLDOWN_SECONDS - elapsed)}s before resending` },
          429,
        );
      }
    }

    const { data: targetUser, error: getErr } = await adminClient.auth.admin.getUserById(userId);
    if (getErr || !targetUser?.user?.email) {
      return json({ error: "User not found" }, 404);
    }
    const email = targetUser.user.email;

    // Try invite first; if the user already exists in auth, fall back to a recovery email
    // so they can set/reset their password and complete onboarding.
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "";
    const redirectTo = origin ? `${origin}/reset-password` : undefined;
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteError) {
      const msg = inviteError.message || "";
      const alreadyExists =
        /already.*registered/i.test(msg) ||
        /already exists/i.test(msg) ||
        (inviteError as { code?: string }).code === "email_exists";

      if (!alreadyExists) {
        console.error("admin-resend-invite: inviteUserByEmail failed", msg);
        return json(
          {
            error: `Invite email was not sent: ${msg}`,
            hint: "Check Supabase Auth email settings, SMTP/provider delivery logs, and whether this user has already accepted an invite.",
          },
          502,
        );
      }

      const { error: recoveryError } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (recoveryError) {
        console.error("admin-resend-invite: resetPasswordForEmail failed", recoveryError.message);
        return json(
          {
            error: `Invite email was not sent: ${recoveryError.message}`,
            hint: "Check Supabase Auth email settings and SMTP/provider delivery logs.",
          },
          502,
        );
      }
    }

    await adminClient
      .from("profiles")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", userId);

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
