import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, sha256Hex } from "../_shared/mfa-cors.ts";
import { MFA_REQUIRED, sessionVerified } from "../_shared/session.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { captureEdgeError } from "../_shared/sentry.ts";

// The restore itself runs in the database (restore_workshop_data) as one
// transaction: every table is replaced with triggers paused, every link between
// tables is checked, and anything that doesn't fit rolls the whole thing back.
// Accounts can't be restored, so people are only updated if they still exist,
// and the admin running the restore keeps their role.
// Version 1 backups (before teams, quotes, purchasing and shipping) still load;
// teams and access that aren't in the file are kept.
const SUPPORTED_VERSIONS = [1, 2];

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
    if (!(await sessionVerified(authHeader))) {
      return new Response(JSON.stringify({ error: MFA_REQUIRED }), {
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

    if (!SUPPORTED_VERSIONS.includes(body.manifest.version)) {
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

    const { data: counts, error: restoreError } = await adminClient.rpc("restore_workshop_data", {
      _data: body.data,
      _caller: callerId,
    });
    if (restoreError) {
      return new Response(JSON.stringify({ error: `Nothing was changed. ${restoreError.message}` }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const restored = counts as Record<string, number>;

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
