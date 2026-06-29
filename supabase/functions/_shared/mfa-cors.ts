// Shared CORS helper. Per-request origin echoing so any *.shoplane.uk fork,
// any Lovable preview/published origin, localhost dev, and any host listed in
// the ALLOWED_ORIGINS env (comma-separated) are all accepted without code edits.

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

function envOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("ALLOWED_ORIGIN") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const proto = url.protocol;

  // Any *.shoplane.uk subdomain (and the apex)
  if (proto === "https:" && (host === "shoplane.uk" || host.endsWith(".shoplane.uk"))) return true;

  // Lovable preview & published
  if (proto === "https:" && (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com"))) return true;

  // Local dev
  if ((proto === "http:" || proto === "https:") && (host === "localhost" || host === "127.0.0.1")) return true;

  // Explicit env allow-list
  const normalized = `${proto}//${url.host}`;
  if (envOrigins().includes(normalized)) return true;

  return false;
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = origin && isAllowedOrigin(origin)
    ? origin
    : (envOrigins()[0] ?? "https://shoplane.uk");

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

// Back-compat static export (used when no request is in scope). Echoes the
// first env-configured origin, falling back to the canonical Shoplane apex.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": envOrigins()[0] ?? "https://shoplane.uk",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": ALLOWED_HEADERS,
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
