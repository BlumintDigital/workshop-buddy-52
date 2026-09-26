import { describe, expect, it } from "vitest";
import { discountColumns, invoiceTotals } from "@/lib/invoiceTotals";

describe("invoiceTotals", () => {
  it("adds tax to the subtotal when there's no discount", () => {
    expect(invoiceTotals(1000, 10)).toEqual({ subtotal: 1000, discountAmount: 0, taxable: 1000, taxAmount: 100, total: 1100 });
  });

  it("takes a percentage discount off before tax", () => {
    const t = invoiceTotals(1000, 10, { type: "percent", value: 10 });
    expect(t.discountAmount).toBe(100);
    expect(t.taxAmount).toBe(90);
    expect(t.total).toBe(990);
  });

  it("takes a fixed discount off before tax and never below zero", () => {
    expect(invoiceTotals(200, 20, { type: "amount", value: 50 }).total).toBe(180);
    expect(invoiceTotals(200, 20, { type: "amount", value: 500 }).total).toBe(0);
  });

  it("rounds to cents", () => {
    const t = invoiceTotals(99.99, 7.5, { type: "percent", value: 12.5 });
    expect(t.discountAmount).toBe(12.5);
    expect(t.taxAmount).toBe(6.56);
    expect(t.total).toBe(94.05);
  });
});

describe("discountColumns", () => {
  it("clears every discount column when there is none", () => {
    expect(discountColumns(100, { type: null, value: 0 })).toEqual({ discount_type: null, discount_value: 0, discount_amount: 0, discount_reason: null });
    expect(discountColumns(100, { type: "percent", value: 0 })).toEqual({ discount_type: null, discount_value: 0, discount_amount: 0, discount_reason: null });
  });

  it("stores the type, value, amount and reason", () => {
    expect(discountColumns(400, { type: "percent", value: 25, reason: " Loyalty " })).toEqual({
      discount_type: "percent",
      discount_value: 25,
      discount_amount: 100,
      discount_reason: "Loyalty",
    });
  });
});
