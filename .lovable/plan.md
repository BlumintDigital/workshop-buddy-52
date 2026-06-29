## 1. Verify USD base aggregation
Audit existing dashboards and confirm/normalize that all aggregated values use `base_total` (workshop base currency) and surface the base currency code from `useCurrency()`.

Findings from audit:
- `AdminDashboard` revenue + sparkline: uses `base_total ?? total`. ✓
- `ManagerDashboard` overdue amount: uses `base_total ?? total`. ✓
- `ClientDashboard` outstanding balance: uses `base_total ?? total`. ✓
- `StaffDashboard`: no revenue/totals rendered. ✓
- `get_monthly_revenue()` RPC already sums `base_total`. ✓

Fixes to apply:
- `ClientDashboard` per-invoice line currently formats `inv.total` with `inv.currency` — keep as-is (per-invoice native currency is correct), but add a small "(≈ {base})" hint when the invoice currency differs from the workshop base, using `base_total`.
- Add a one-line caption under every aggregate tile that shows "in USD" (or the active base) so users know totals are in base currency, not the displayed-invoice currency.

## 2. Standardize currency display
Update `src/lib/currencies.ts` `formatMoney` to:
- Use `currencyDisplay: "code"` (renders "USD 1,234.56" instead of "$1,234.56") so ISO code is always visible.
- For zero-decimal currencies (JPY), use `minimumFractionDigits: 0`; all others fixed at 2 decimals.
- Keep `Intl.NumberFormat` for thousands separators; fallback string also uses 2 decimals.

Touch points reusing `format()` from `useCurrency` automatically inherit the change: AdminDashboard, ManagerDashboard, ClientDashboard, InvoiceDetail, InvoiceCreate, AdminInvoices, ClientInvoices, invoicePdf. No per-file edits needed beyond the lib change.

## 3. Brand color customization (feasibility: light lift)
Not heavy — the app already drives theme via HSL CSS variables in `src/index.css`. Add a small branding-color picker and inject overrides at runtime.

Implementation:
- Migration: add columns to `workshop_settings`:
  - `brand_primary_hsl text` (e.g. "110 14% 54%")
  - `brand_accent_hsl text` (optional second color)
- `src/lib/branding.ts`: add `applyBrandColors({ primary, accent })` that sets CSS vars on `document.documentElement` for `--primary`, `--sidebar-primary`, `--ring`, and `--accent` (derived shades computed by adjusting L by ±10%).
- New `BrandColorProvider` mounted in `App.tsx` that loads `workshop_settings` once + subscribes to realtime changes and calls `applyBrandColors`.
- `AdminSettings.tsx` → Branding tab: add a `<ColorPicker>` (hex input + 6 preset swatches: Sage default, Indigo, Rose, Amber, Teal, Slate). Convert hex → HSL on save. Live-preview by calling `applyBrandColors` on change before persisting.
- Reset button restores defaults (clears columns → falls back to CSS-defined values).

Scope guardrails:
- Only `--primary` and `--accent` families are overridden. Background, foreground, card, and destructive tokens stay fixed to preserve contrast and legibility.
- Dark mode uses the same hue/saturation with adjusted lightness.

Estimated effort: ~1 short build (one migration, one provider, one settings UI block, ~150 LOC total).
