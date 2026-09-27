import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

// The table list lives in the database (export_workshop_data), next to the
// restore that reads it back, so the two can't drift apart. It leaves out
// activity history, push subscriptions, MFA secrets and per-person preferences.
const BACKUP_VERSION = 2;

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

    if (!roleData || roleData.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
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
        { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // One consistent snapshot of every table, with no row limit.
    const { data: exported, error: exportError } = await adminClient.rpc("export_workshop_data");
    if (exportError || !exported) {
      return new Response(JSON.stringify({ error: `Backup failed: ${exportError?.message ?? "no data returned"}` }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const data = exported as Record<string, unknown[]>;
    const rowCounts: Record<string, number> = Object.fromEntries(
      Object.entries(data).map(([table, rows]) => [table, rows.length]),
    );

    const dataJson = JSON.stringify(data);
    const checksum = await sha256Hex(dataJson);
    const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0);
    const createdAt = new Date().toISOString();

    const backup = {
      manifest: {
        version: BACKUP_VERSION,
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
        ...cors,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    await captureEdgeError(err, "backup-data");
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
