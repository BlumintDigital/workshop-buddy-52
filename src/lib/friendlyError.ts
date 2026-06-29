import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from "@supabase/supabase-js";

/**
 * Translate raw Supabase / Postgres / Edge Function errors into a short,
 * actionable message we can safely surface in a toast.
 */
export async function friendlyErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): Promise<string> {
  if (!err) return fallback;

  // Supabase Edge Function errors: try to read the JSON body the function returned.
  if (err instanceof FunctionsHttpError) {
    try {
      const body = await err.context.json();
      const msg =
        body?.error ||
        body?.message ||
        body?.msg ||
        body?.hint ||
        body?.details;
      if (msg && typeof msg === "string") return prettify(msg);
    } catch {
      try {
        const text = await err.context.text();
        if (text) return prettify(text);
      } catch {
        /* ignore */
      }
    }
    return "The server rejected the request. Please check your input and try again.";
  }
  if (err instanceof FunctionsRelayError) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (err instanceof FunctionsFetchError) {
    return "Network error contacting the server. Please retry in a moment.";
  }

  const anyErr = err as any;
  const raw: string =
    anyErr?.message ||
    anyErr?.error_description ||
    anyErr?.error ||
    (typeof err === "string" ? err : "") ||
    "";

  return prettify(raw) || fallback;
}

/** Synchronous variant — use when the error definitely isn't an Edge Function response. */
export function friendlyErrorMessageSync(
  err: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  if (!err) return fallback;
  const anyErr = err as any;
  const raw: string =
    anyErr?.message ||
    anyErr?.error_description ||
    anyErr?.error ||
    (typeof err === "string" ? err : "") ||
    "";
  return prettify(raw) || fallback;
}

function prettify(raw: string): string {
  const msg = raw.trim();
  if (!msg) return "";

  // Postgres / RLS
  if (/row-level security|permission denied|not authorized|42501/i.test(msg)) {
    return "You don't have permission to perform this action.";
  }
  if (/duplicate key|already exists|23505/i.test(msg)) {
    return "That record already exists. Please use a different value.";
  }
  if (/foreign key|violates foreign key|23503/i.test(msg)) {
    return "This action references a record that no longer exists.";
  }
  if (/not-null|null value in column|23502/i.test(msg)) {
    return "A required field is missing. Please complete the form and try again.";
  }
  if (/check constraint|23514/i.test(msg)) {
    return "One of the values is invalid. Please review the form.";
  }
  if (/jwt|invalid token|expired|401/i.test(msg)) {
    return "Your session has expired. Please sign in again.";
  }
  if (/rate limit|too many/i.test(msg)) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (/network|failed to fetch|load failed/i.test(msg)) {
    return "Network error. Check your connection and try again.";
  }
  if (/storage|payload too large|413/i.test(msg) && /large|size/i.test(msg)) {
    return "The file is too large. Please choose a smaller file.";
  }

  // Strip Postgres prefixes for a cleaner message.
  return msg.replace(/^(Error|PostgrestError|FunctionsHttpError):\s*/i, "");
}
