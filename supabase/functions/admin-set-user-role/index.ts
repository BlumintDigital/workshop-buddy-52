import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/mfa-cors.ts";

const VALID_ROLES = ["admin", "manager", "staff", "client"] as const;
type Role = (typeof VALID_ROLES)[number];

const friendlyRoleError = (message?: string) => {
  const text = message ?? "Failed to update role";
  const lower = text.toLowerCase();
  if (lower.includes("final admin")) return "Cannot remove the final admin account.";
  if (lower.includes("own role")) return "You cannot change your own role.";
  if (lower.includes("super admin")) return "Super admin accounts cannot be changed here.";
  if (lower.includes("administrator access")) return "Only admins can change user roles.";
  return text;
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
    if (req.method !== "POST") return json({ error: "POST required" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRole || !anonKey) {
      return json({ error: "Server configuration error" }, 500);
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id ?? "").trim();
    const role = String(body.role ?? "") as Role;

    if (!userId) return json({ error: "User is required" }, 400);
    if (!VALID_ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

    const adminClient = createClient(supabaseUrl, serviceRole);
    const { data, error } = await adminClient.rpc("admin_set_user_role", {
      _caller_user_id: callerId,
      _target_user_id: userId,
      _role: role,
    });

    if (error) {
      console.error("admin-set-user-role failed:", error.message);
      const status = error.code === "42501" ? 403 : 400;
      return json({ error: friendlyRoleError(error.message) }, status);
    }

    return json({ success: true, role: data });
  } catch (err) {
    console.error("admin-set-user-role unhandled:", err);
    return json({ error: "Failed to update role" }, 500);
  }
});