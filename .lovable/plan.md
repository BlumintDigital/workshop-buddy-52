# Multi-Currency Support

Today the platform has one workshop-wide currency (`workshop_settings.currency`) used for display only. Every invoice/total is treated as that currency. This plan adds the ability to **record income in any currency** while keeping reporting consistent.

## Approach

Each invoice carries its own `currency` and an `fx_rate` to the workshop's base currency captured at creation time. The invoice is always displayed in its native currency; dashboards and reports aggregate using the base-currency equivalent.

## Scope

### Database (migration)
- `invoices`: add `currency text` (default = workshop base), `fx_rate numeric` (default 1, rate to base currency at creation), `base_total numeric` (generated: `total * fx_rate`).
- `workshop_settings`: add `enabled_currencies text[]` (allow-list shown in pickers, default `[base]`).
- Backfill existing invoices with the current workshop currency and fx_rate = 1.
- Update `get_monthly_revenue()` to sum `base_total` instead of `total`.

### Backend logic
- Edge function or client lookup to fetch an FX rate when the user picks a non-base currency. Two options to choose from in the question below.

### UI
- **Invoice create/edit** (`InvoiceCreate.tsx`, `InvoiceDetail.tsx`):
  - Currency dropdown (from `enabled_currencies`), defaults to base.
  - When non-base: show fetched FX rate (editable) and the base-currency equivalent of the total.
- **Invoice list / detail / PDF / client view / email**: format amounts in the invoice's own currency (not the workshop default).
- **Dashboard / Reports / Goals**: keep formatting in base currency, sourced from `base_total`. Add a small "values converted from X currencies" note when mixed.
- **Settings → Workshop**: multi-select for `enabled_currencies`; base currency stays the existing field.

### Out of scope
- Multi-currency on inventory item prices, expenses, or staff payroll.
- Historical FX revaluation (rate is locked at invoice creation; user can edit before marking paid).
- Per-client default currency (could be a follow-up).

## Technical notes
- New `useCurrency` overload `format(amount, code)` so any currency code can be formatted without changing the base hook contract.
- `base_total` as a generated column keeps reports trivial and avoids drift.
- Realtime on `workshop_settings` already enabled, so `enabled_currencies` changes propagate to open pickers.

## Open question

How should FX rates be sourced?

1. **Manual entry** — user types the rate when creating the invoice (no external dependency, fastest to ship).
2. **Auto-fetch via free API** (e.g. exchangerate.host) with manual override — more convenient, requires an edge function and accepting an external service.

I'll ask this as a follow-up after you approve the plan, or you can call it out now.
