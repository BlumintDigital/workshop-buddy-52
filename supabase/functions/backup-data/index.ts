import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

// Tables exported in FK-safe order (children after parents).
// Skips activity_logs (large read-only history), push_subscriptions (transient),
// and mfa_* tables (device-bound security data).
const EXPORT_TABLES = [
  "profiles",
  "user_roles",
  "workshop_settings",
  "feature_flags",
  "signup_codes",
  "broadcasts",
  "system_notices",
  "inventory_items",
  "jobs",
  "job_tasks",
  "job_updates",
  "job_comments",
  "job_attachments",
  "job_ratings",
  "job_task_notes",
  "appointments",
  "inventory_transactions",
  "invoices",
  "invoice_items",
  "notifications",
  "bug_reports",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
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
        headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
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

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 5 backups per hour per admin
    const rl = await checkRateLimit(callerId, "backup_generate", {
      limit: 5,
      windowSec: 3600,
      lockoutSec: 3600,
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfterSec}s.` }),
        { status: 429, headers: { ...buildCorsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Export all tables
    const data: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};

    for (const table of EXPORT_TABLES) {
      const { data: rows, error } = await adminClient.from(table).select("*");
      if (error) {
        return new Response(JSON.stringify({ error: `Failed to export ${table}: ${error.message}` }), {
          status: 500,
          headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
        });
      }
      data[table] = rows ?? [];
      rowCounts[table] = (rows ?? []).length;
    }

    const dataJson = JSON.stringify(data);
    const checksum = await sha256Hex(dataJson);
    const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0);
    const createdAt = new Date().toISOString();

    const backup = {
      manifest: {
        version: 1,
        app: "workshop-buddy",
        created_at: createdAt,
        row_counts: rowCounts,
        checksum,
      },
      data,
    };

    // Audit log
    await adminClient.from("activity_logs").insert({
      user_id: callerId,
      action: "exported",
      table_name: "backup",
      record_id: "backup",
      summary: `Database backup created (${totalRows} rows)`,
      details: { row_counts: rowCounts, created_at: createdAt },
    });

    return new Response(JSON.stringify(backup), {
      status: 200,
      headers: {
        ...buildCorsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    await captureEdgeError(err, "backup-data");
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...buildCorsHeaders, "Content-Type": "application/json" },
    });
  }
});
