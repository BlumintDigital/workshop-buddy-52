// Shared status badge styles and labels used across dashboards and request pages.
// Keep colour changes here so every view stays consistent.

/** Job status → pastel tile classes (dashboards, job lists). */
export const jobStatusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  in_progress: "bg-tile-sky text-foreground/80",
  review: "bg-tile-blush text-foreground/80",
  completed: "bg-tile-sage text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
};

/** Invoice status → pastel tile classes (client dashboard open-invoice list). */
export const invoiceStatusTone: Record<string, string> = {
  paid: "bg-tile-sage text-foreground/80",
  draft: "bg-muted text-muted-foreground",
  sent: "bg-tile-sky text-foreground/80",
  overdue: "bg-tile-blush text-foreground/80",
};

/** Client request status → pastel tile classes (client + admin request pages). */
export const requestStatusTone: Record<string, string> = {
  pending: "bg-tile-butter text-foreground/80",
  quoted: "bg-tile-sky text-foreground/80",
  approved: "bg-tile-sage text-foreground/80",
  declined_by_client: "bg-tile-blush text-foreground/80",
  converted: "bg-tile-sage text-foreground/80",
  declined: "bg-tile-blush text-foreground/80",
  cancelled: "bg-muted text-muted-foreground",
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
