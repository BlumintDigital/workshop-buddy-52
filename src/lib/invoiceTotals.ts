// Invoice arithmetic in one place, so the editor, the saved record and the PDF
// always agree. The discount comes off the subtotal before tax is added.

export type DiscountType = "percent" | "amount";

export interface InvoiceDiscount {
  type: DiscountType | null;
  value: number;
  reason?: string | null;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  /** Subtotal after the discount: what tax is charged on. */
  taxable: number;
  taxAmount: number;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function discountAmountFor(subtotal: number, discount: InvoiceDiscount | null | undefined): number {
  if (!discount?.type || !(discount.value > 0) || subtotal <= 0) return 0;
  if (discount.type === "percent") return round2((subtotal * Math.min(discount.value, 100)) / 100);
  return round2(Math.min(discount.value, subtotal));
}

export function invoiceTotals(subtotal: number, taxRate: number, discount?: InvoiceDiscount | null): InvoiceTotals {
  const sub = round2(Math.max(0, subtotal));
  const discountAmount = discountAmountFor(sub, discount);
  const taxable = round2(sub - discountAmount);
  const taxAmount = round2((taxable * Math.max(0, taxRate || 0)) / 100);
  return { subtotal: sub, discountAmount, taxable, taxAmount, total: round2(taxable + taxAmount) };
}

/** Columns to store on the invoice row for a discount (all cleared when there is none). */
export function discountColumns(subtotal: number, discount: InvoiceDiscount | null | undefined) {
  const amount = discountAmountFor(subtotal, discount);
  if (!discount?.type || amount === 0) {
    return { discount_type: null, discount_value: 0, discount_amount: 0, discount_reason: null };
  }
  return {
    discount_type: discount.type,
    discount_value: discount.value,
    discount_amount: amount,
    discount_reason: discount.reason?.trim() || null,
  };
}

/** "Discount (10%)" or "Discount". */
export function discountLabel(discount: InvoiceDiscount | null | undefined): string {
  return discount?.type === "percent" && discount.value > 0 ? `Discount (${discount.value}%)` : "Discount";
}
