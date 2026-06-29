export const CURRENCIES: { value: string; label: string }[] = [
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
  { value: "NGN", label: "NGN — Nigerian Naira" },
  { value: "ZAR", label: "ZAR — South African Rand" },
  { value: "KES", label: "KES — Kenyan Shilling" },
  { value: "GHS", label: "GHS — Ghanaian Cedi" },
  { value: "INR", label: "INR — Indian Rupee" },
  { value: "JPY", label: "JPY — Japanese Yen" },
  { value: "CNY", label: "CNY — Chinese Yuan" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "AED", label: "AED — UAE Dirham" },
];

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function formatMoney(amount: number, code: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const ccy = (code || "USD").toUpperCase();
  const digits = ZERO_DECIMAL.has(ccy) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      currencyDisplay: "code",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${ccy} ${n.toFixed(digits)}`;
  }
}

