import { supabase } from "@/integrations/supabase/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Display names for a set of user IDs. Tables such as job_comments reference
 * auth.users rather than profiles, so PostgREST can't embed the name; this
 * resolves them in one query. Unknown IDs fall back to `fallback`.
 */
export async function fetchProfileNames(ids: (string | null | undefined)[], fallback = "Team member"): Promise<Record<string, string>> {
  // Only real user IDs: one malformed value would make the whole lookup fail.
  const unique = [...new Set(ids.filter((id): id is string => !!id && UUID.test(id)))];
  if (unique.length === 0) return {};
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  const names: Record<string, string> = {};
  for (const id of unique) names[id] = fallback;
  data?.forEach((p) => {
    names[p.id] = p.full_name || fallback;
  });
  return names;
}

export function initials(name: string | null | undefined): string {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** "just now", "5m ago", "3h ago", then the date. */
export function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
