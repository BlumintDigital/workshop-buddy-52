// Shared vocabulary for projects (stored as `jobs` in the database): links,
// status labels and the stages a client sees.

import type { StatusTone } from "@/components/dashboard/StatusPill";
import type { AppRole } from "@/hooks/useAuth";

/** The project page. Old /jobs/:id links redirect here. */
export const projectPath = (id: string) => `/projects/${id}`;

/** The role's project list. */
export const projectsListPath = (role: AppRole | null | undefined) => (role ? `/${role}/projects` : "/");

/** Every status a project can be in, in lifecycle order. */
export const PROJECT_STATUSES = [
  "received",
  "evaluation",
  "quote",
  "pending",
  "in_progress",
  "review",
  "completed",
  "shipped",
  "cancelled",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  received: "Received",
  evaluation: "Evaluating",
  quote: "Quote sent",
  pending: "Approved",
  in_progress: "In progress",
  review: "Quality check",
  completed: "Ready to ship",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_TONE: Record<string, StatusTone> = {
  received: "neutral",
  evaluation: "info",
  quote: "warning",
  pending: "info",
  in_progress: "info",
  review: "warning",
  completed: "success",
  shipped: "success",
  cancelled: "neutral",
};

export function projectStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return PROJECT_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/** Statuses where work is still ahead of the workshop (used by dashboards and counts). */
export const OPEN_PROJECT_STATUSES = ["received", "evaluation", "quote", "pending", "in_progress", "review"] as const;

/** "EDL-202609-001 · Lathe spindle rebuild" */
export function projectLabel(p: { ref?: string | null; title: string }): string {
  return p.ref ? `${p.ref} · ${p.title}` : p.title;
}

/**
 * The stages shown to clients, and which statuses belong to each. A client
 * never sees internal steps such as task handoffs.
 */
export const CLIENT_STAGES: { key: string; label: string; statuses: string[] }[] = [
  { key: "received", label: "Received", statuses: ["received"] },
  { key: "assessment", label: "Assessment", statuses: ["evaluation", "quote"] },
  { key: "approved", label: "Approved", statuses: ["pending"] },
  { key: "in_progress", label: "In progress", statuses: ["in_progress"] },
  { key: "quality", label: "Quality check", statuses: ["review"] },
  { key: "ready", label: "Ready", statuses: ["completed"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
];

/** Index of the client stage a status falls in, or -1 for cancelled. */
export function clientStageIndex(status: string): number {
  return CLIENT_STAGES.findIndex((s) => s.statuses.includes(status));
}

/**
 * PostgREST `or` filter matching a project's ID or title. Characters with a
 * meaning in filter syntax are dropped so typed text can't change the query.
 */
export function projectSearchFilter(query: string): string | null {
  const q = query.replace(/[,()*%\\"]/g, " ").trim();
  if (!q) return null;
  return `title.ilike.%${q}%,ref.ilike.%${q}%`;
}
