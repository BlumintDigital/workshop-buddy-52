// Client-facing invoice status labels. Hides internal jargon like "draft" / "sent"
// in favour of language that's actionable for clients.

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export function clientFriendlyInvoiceStatus(status: string, clientMarkedPaidAt?: string | null): string {
  if (clientMarkedPaidAt && status !== "paid") return "Payment submitted — awaiting confirmation";
  switch (status) {
    case "sent":
      return "Awaiting payment";
    case "overdue":
      return "Overdue — please pay";
    case "paid":
      return "Paid";
    case "cancelled":
      return "Cancelled";
    default:
      // We never show drafts to clients; fall back to a safe label.
      return "In progress";
  }
}

export const clientStatusTone: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "secondary",
  paid: "default",
  overdue: "destructive",
  cancelled: "outline",
};

