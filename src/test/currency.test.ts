import { describe, expect, it } from "vitest";

// Pure formatting equivalent of useCurrency's format helper, extracted so we can
// exercise it without mounting React.
function formatCurrency(currency: string, n: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `${currency} ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
  }
}

describe("currency formatter", () => {
  it("formats USD with 2 decimal places", () => {
    expect(formatCurrency("USD", 1234.5)).toMatch(/1,234\.50/);
  });

  it("formats GBP", () => {
    expect(formatCurrency("GBP", 99)).toMatch(/99\.00/);
  });

  it("handles non-finite numbers as zero", () => {
    expect(formatCurrency("USD", NaN)).toMatch(/0\.00/);
    expect(formatCurrency("USD", Infinity)).toMatch(/0\.00/);
  });

  it("falls back to plain string for unknown currency code", () => {
    const out = formatCurrency("ZZZ_NOT_REAL" as string, 5);
    expect(out).toContain("5.00");
  });
});
