// The same "has this session passed 2FA?" test the database uses
// (public.session_verified), for edge functions that act with the service role
// and so skip the database's own rules.
//
// Admins and managers always need it; anyone else once they've turned 2FA on.
// A trusted browser or a backup code counts, exactly as in the database.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const MFA_REQUIRED = "Enter your 2FA code to continue.";

export async function sessionVerified(authHeader: string): Promise<boolean> {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("session_verified");
  return !error && data === true;
}

/** True when the caller is the server itself (the service role key), e.g. admin-api acting on an operator's behalf. */
export function isServiceCall(authHeader: string | null): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return !!key && !!authHeader && safeEqual(authHeader, `Bearer ${key}`);
}

/** Constant-time string comparison for secrets. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
