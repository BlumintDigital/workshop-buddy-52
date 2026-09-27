export interface QuoteForInvoice {
  kind: string;
  number: number;
  status: string;
  currency: string | null;
  subtotal: number;
  items: { description: string; quantity: number; unit_price: number }[];
}

export interface InvoiceDraftLines {
  lines: { description: string; quantity: number; unit_price: number }[];
  /** What the client agreed to pay: accepted quote plus accepted change requests. */
  agreed: number;
  currency: string | null;
  quoteCount: number;
  changeCount: number;
}

/**
 * The invoice lines a project has already agreed: the accepted quote's lines,
 * then each accepted change request's lines, labelled so the client can match
 * them to what they approved. Returns null when nothing has been accepted.
 */
export function linesFromAgreedQuotes(quotes: QuoteForInvoice[]): InvoiceDraftLines | null {
  const accepted = quotes
    .filter((q) => q.status === "accepted")
    .sort((a, b) => (a.kind === b.kind ? a.number - b.number : a.kind === "quote" ? -1 : 1));
  if (!accepted.length) return null;
  const lines = accepted.flatMap((q) =>
    q.items.map((i) => ({
      description: q.kind === "change" ? `Change CR${q.number}: ${i.description}` : i.description,
      quantity: i.quantity,
      unit_price: i.unit_price,
    })),
  );
  return {
    lines,
    agreed: Math.round(accepted.reduce((s, q) => s + q.subtotal, 0) * 100) / 100,
    currency: accepted.find((q) => q.kind === "quote")?.currency ?? accepted[0].currency ?? null,
    quoteCount: accepted.filter((q) => q.kind === "quote").length,
    changeCount: accepted.filter((q) => q.kind === "change").length,
  };
}
