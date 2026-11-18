// Quality check and shipping are project stages, not tasks. A task with one of
// these names would never be handed off, so the project would never reach QC.
// Keep in step with public.is_reserved_task_title() in the database.

const RESERVED = new Set(["quality check", "qc", "final inspection", "shipping", "ship", "collection", "hand over", "handover", "delivery"]);

export const RESERVED_TASK_TITLE_MESSAGE = "Quality check and shipping are stages, not tasks. They start automatically when every task is handed off.";

/** True when the whole title (ignoring case, spacing and punctuation) names a stage. */
export function isReservedTaskTitle(title: string): boolean {
  const words = title.toLowerCase().replace(/\./g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return RESERVED.has(words);
}
