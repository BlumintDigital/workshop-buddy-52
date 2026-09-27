import { describe, expect, it } from "vitest";
import { linesFromAgreedQuotes, type QuoteForInvoice } from "@/lib/invoiceFromQuotes";

const quote = (over: Partial<QuoteForInvoice>): QuoteForInvoice => ({
  kind: "quote",
  number: 1,
  status: "accepted",
  currency: "GBP",
  subtotal: 0,
  items: [],
  ...over,
});

describe("linesFromAgreedQuotes", () => {
  it("returns nothing when no quote has been accepted", () => {
    expect(linesFromAgreedQuotes([quote({ status: "sent" })])).toBeNull();
  });

  it("uses the accepted quote, then accepted changes in order, and skips the rest", () => {
    const result = linesFromAgreedQuotes([
      quote({ kind: "change", number: 2, subtotal: 50, items: [{ description: "Extra bearing", quantity: 1, unit_price: 50 }] }),
      quote({ number: 1, subtotal: 400, items: [{ description: "Rewind motor", quantity: 1, unit_price: 350 }, { description: "Labour", quantity: 2, unit_price: 25 }] }),
      quote({ kind: "change", number: 1, subtotal: 30, items: [{ description: "Seal kit", quantity: 1, unit_price: 30 }] }),
      quote({ kind: "change", number: 3, status: "declined", subtotal: 999, items: [{ description: "Declined", quantity: 1, unit_price: 999 }] }),
      quote({ number: 2, status: "withdrawn", subtotal: 500, items: [{ description: "Old quote", quantity: 1, unit_price: 500 }] }),
    ]);
    expect(result?.lines.map((l) => l.description)).toEqual(["Rewind motor", "Labour", "Change CR1: Seal kit", "Change CR2: Extra bearing"]);
    expect(result?.agreed).toBe(480);
    expect(result?.currency).toBe("GBP");
    expect(result?.changeCount).toBe(2);
  });
});
