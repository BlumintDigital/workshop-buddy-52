import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RateLimitAction = "backup_generate" | "trust_device" | "backup_verify";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  lockedUntil: string | null;
}

interface Options {
  limit: number;
  windowSec: number;
  lockoutSec: number;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Atomic-ish check. Reads the current row, returns lockout state if active,
 * otherwise increments and persists. Window resets when expired.
 *
 * `consumeOnAllowed=false` lets the caller record an attempt only on failure
 * (used by backup_verify so successful verifications don't burn the counter).
 */
export async function checkRateLimit(
  userId: string,
  action: RateLimitAction,
  opts: Options,
  consumeOnAllowed = true,
): Promise<RateLimitResult> {
  const admin = adminClient();
  const now = new Date();
  const nowMs = now.getTime();

  const { data: row } = await admin
    .from("mfa_rate_limits")
    .select("attempt_count, window_started_at, locked_until")
    .eq("user_id", userId)
    .eq("action", action)
    .maybeSingle();

  // Currently locked out
  if (row?.locked_until) {
    const lockedMs = new Date(row.locked_until).getTime();
    if (lockedMs > nowMs) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.ceil((lockedMs - nowMs) / 1000),
        lockedUntil: row.locked_until,
      };
    }
  }

  let windowStart = row?.window_started_at ? new Date(row.window_started_at).getTime() : nowMs;
  let count = row?.attempt_count ?? 0;

  // Window expired → reset
  if (nowMs - windowStart > opts.windowSec * 1000) {
    windowStart = nowMs;
    count = 0;
  }

  if (count >= opts.limit) {
    const lockedUntil = new Date(nowMs + opts.lockoutSec * 1000).toISOString();
    await admin.from("mfa_rate_limits").upsert({
      user_id: userId,
      action,
      attempt_count: count,
      window_started_at: new Date(windowStart).toISOString(),
      locked_until: lockedUntil,
      updated_at: now.toISOString(),
    });
    return { allowed: false, remaining: 0, retryAfterSec: opts.lockoutSec, lockedUntil };
  }

  if (consumeOnAllowed) {
    count += 1;
    await admin.from("mfa_rate_limits").upsert({
      user_id: userId,
      action,
      attempt_count: count,
      window_started_at: new Date(windowStart).toISOString(),
      locked_until: null,
      updated_at: now.toISOString(),
    });
  }

  return {
    allowed: true,
    remaining: Math.max(0, opts.limit - count),
    retryAfterSec: 0,
    lockedUntil: null,
  };
}

/** Record a failure (used by backup_verify when verification fails). */
export async function recordFailure(
  userId: string,
  action: RateLimitAction,
  opts: Options,
): Promise<RateLimitResult> {
  return checkRateLimit(userId, action, opts, true);
}

/** Reset counters on success (e.g. correct backup code). */
export async function resetRateLimit(userId: string, action: RateLimitAction): Promise<void> {
  const admin = adminClient();
  await admin
    .from("mfa_rate_limits")
    .delete()
    .eq("user_id", userId)
    .eq("action", action);
}
