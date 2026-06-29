import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

// Delete order is reverse of insert order (children before parents).
// Intentionally excludes profiles/user_roles/auth.users — the calling admin
// must stay authenticated, and auth users cannot be restored anyway.
const DELETE_ORDER = [
  "bug_reports",
  "notifications",
  "invoice_items",
  "invoices",
  "inventory_transactions",
  "appointments",
  "job_task_notes",
  "job_ratings",
  "job_comments",
  "job_attachments",
  "job_updates",
  "job_tasks",
  "jobs",
  "inventory_items",
  "system_notices",
  "broadcasts",
  "signup_codes",
];

// Insert order: parents before children.
const INSERT_ORDER = [
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

const BATCH_SIZE = 500;

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

    // Rate limit: max 3 restores per hour (destructive operation)
    const rl = await checkRateLimit(callerId, "backup_verify", {
      limit: 3,
      windowSec: 3600,
      lockoutSec: 7200,
    });
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfterSec}s.` }),
        { status: 429, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate the backup
    let body: { manifest: { version: number; app: string; created_at: string; checksum: string }; data: Record<string, unknown[]> };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!body?.manifest || !body?.data) {
      return new Response(JSON.stringify({ error: "Missing manifest or data in backup file" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (body.manifest.app !== "workshop-buddy") {
      return new Response(JSON.stringify({ error: "Backup file is not from this application" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (body.manifest.version !== 1) {
      return new Response(JSON.stringify({ error: `Unsupported backup version: ${body.manifest.version}` }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Verify integrity checksum
    const computedChecksum = await sha256Hex(JSON.stringify(body.data));
    if (computedChecksum !== body.manifest.checksum) {
      return new Response(JSON.stringify({ error: "Backup file integrity check failed — file may be corrupted or tampered with" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Delete operational data in reverse dependency order
    for (const table of DELETE_ORDER) {
      const { error } = await adminClient
        .from(table)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) {
        return new Response(JSON.stringify({ error: `Failed to clear ${table}: ${error.message}` }), {
          status: 500,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }

    // Insert restored data in dependency order
    const restored: Record<string, number> = {};

    for (const table of INSERT_ORDER) {
      const rows = body.data[table];
      if (!rows || rows.length === 0) {
        restored[table] = 0;
        continue;
      }

      // Insert in batches
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const { error } = await adminClient
          .from(table)
          .upsert(batch as Record<string, unknown>[], { onConflict: "id", ignoreDuplicates: false });
        if (error) {
          return new Response(
            JSON.stringify({ error: `Failed to restore ${table} (batch ${i / BATCH_SIZE + 1}): ${error.message}` }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } }
          );
        }
        inserted += batch.length;
      }
      restored[table] = inserted;
    }

    const totalRestored = Object.values(restored).reduce((a, b) => a + b, 0);

    // Audit log
    await adminClient.from("activity_logs").insert({
      user_id: callerId,
      action: "imported",
      table_name: "backup",
      record_id: "backup",
      summary: `Database restored from backup (${totalRestored} rows)`,
      details: {
        source_created_at: body.manifest.created_at,
        restored,
      },
    });

    return new Response(JSON.stringify({ success: true, restored }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    await captureEdgeError(err, "restore-data");
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
