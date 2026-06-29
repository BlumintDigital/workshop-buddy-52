// Lightweight Sentry wrapper for Deno edge functions.
//
// Initialises lazily (single instance per cold start) and no-ops when
// SENTRY_DSN is not configured, so local dev keeps working.
//
// Usage:
//   import { withSentry } from "../_shared/sentry.ts";
//   Deno.serve(withSentry(async (req) => { ... }));

// deno-lint-ignore no-explicit-any
let sentryRef: any | null = null;
let sentryInitTried = false;

async function getSentry() {
  if (sentryInitTried) return sentryRef;
  sentryInitTried = true;
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return null;
  try {
    const mod = await import("https://deno.land/x/sentry@8.42.0/index.mjs");
    mod.init({
      dsn,
      tracesSampleRate: 0,
      environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
    });
    sentryRef = mod;
  } catch (e) {
    console.error("Sentry init failed", e);
    sentryRef = null;
  }
  return sentryRef;
}

export type EdgeHandler = (req: Request) => Promise<Response> | Response;

export function withSentry(handler: EdgeHandler, functionName?: string): EdgeHandler {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      const sentry = await getSentry();
      if (sentry) {
        try {
          sentry.captureException(err, {
            tags: { function: functionName ?? "unknown" },
          });
          await sentry.flush?.(1500);
        } catch {
          // Never let Sentry failures mask the real error.
        }
      } else {
        console.error(`[${functionName ?? "edge"}] Unhandled error`, err);
      }
      throw err;
    }
  };
}

/**
 * Report a caught error to Sentry without rethrowing.
 * Use inside existing try/catch blocks that already build their own
 * 500 response — keeps user-facing behaviour intact while still
 * surfacing the exception in monitoring.
 */
export async function captureEdgeError(
  err: unknown,
  functionName: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const sentry = await getSentry();
  if (!sentry) {
    console.error(`[${functionName}] Error`, err, extra ?? {});
    return;
  }
  try {
    sentry.captureException(err, {
      tags: { function: functionName },
      extra,
    });
    await sentry.flush?.(1500);
  } catch {
    // swallow
  }
}
