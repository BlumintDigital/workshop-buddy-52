// Shared status badge styles and labels used across dashboards and request pages.
// Keep colour changes here so every view stays consistent.

// Semantic pill classes. Each pairs a soft background with its state colour (>= 5:1 contrast).
const NEUTRAL = "bg-secondary text-muted-foreground";
const INFO = "bg-info-soft text-info";
const WARNING = "bg-warning-soft text-warning";
const SUCCESS = "bg-success-soft text-success";
const DANGER = "bg-destructive-soft text-destructive";

/** Job status → semantic pill classes (dashboards, job lists). */
export const jobStatusTone: Record<string, string> = {
  pending: NEUTRAL,
  in_progress: INFO,
  review: WARNING,
  completed: SUCCESS,
  cancelled: NEUTRAL,
};

/** Invoice status → semantic pill classes (client dashboard open-invoice list). */
export const invoiceStatusTone: Record<string, string> = {
  paid: SUCCESS,
  draft: NEUTRAL,
  sent: INFO,
  overdue: DANGER,
};

/** Client request status → semantic pill classes (client + admin request pages). */
export const requestStatusTone: Record<string, string> = {
  pending: NEUTRAL,
  quoted: WARNING,
  approved: SUCCESS,
  declined_by_client: DANGER,
  converted: SUCCESS,
  declined: DANGER,
  cancelled: NEUTRAL,
};

/** Request status labels as shown to the client. */
export const requestStatusLabelClient: Record<string, string> = {
  pending: "Awaiting review",
  quoted: "Quote ready — your decision",
  approved: "Approved — waiting for the workshop",
  declined_by_client: "You declined this quote",
  converted: "Converted to job",
  declined: "Declined by workshop",
  cancelled: "Cancelled",
};

/** Request status labels as shown to admin/manager. */
export const requestStatusLabelAdmin: Record<string, string> = {
  pending: "Pending review",
  quoted: "Quote sent — awaiting client",
  approved: "Client approved",
  declined_by_client: "Client declined quote",
  converted: "Converted to job",
  declined: "Declined",
  cancelled: "Cancelled",
};
