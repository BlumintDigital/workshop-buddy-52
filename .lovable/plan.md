## Goal

1. Confirm post-login redirects route every role to its own dashboard.
2. Make sure admin edits to workshop company details (logo, address, phone, email, name) flow into the invoice form and live PDF preview without a page reload.

## 1. Login redirect verification (no code changes)

`src/hooks/useAuth.tsx` already exports `getRoleDashboardPath`:

- admin → `/admin/dashboard`
- manager → `/manager/dashboard`
- staff → `/staff/dashboard`
- client → `/client/dashboard`

`src/pages/Auth.tsx` calls it in all three post-auth paths (already-logged-in redirect, password sign-in, MFA verification). `ProtectedRoute` also redirects mismatched roles to their own dashboard. I will add a short Vitest case asserting `getRoleDashboardPath` returns the right path for each of the four roles + `null`, so any future regression is caught.

## 2. Admin "Workshop company details" propagation

Today `src/pages/admin/AdminSettings.tsx` already edits `workshop_name`, `contact_email`, `phone`, `address`, and `logo_url` on `workshop_settings` (id = 1). The gap is purely propagation: `InvoiceCreate.tsx` fetches workshop details once on mount, and `src/lib/invoicePdf.tsx` re-fetches per PDF export — so an admin saving new details in another tab doesn't refresh the open invoice form/preview.

Changes:

1. **New hook `src/hooks/useWorkshopDetails.ts`**
   - Fetches `workshop_name, address, phone, contact_email, logo_url, currency` from `workshop_settings` once.
   - Subscribes to Supabase Realtime on `workshop_settings` (`UPDATE` where `id = 1`) and refetches on change.
   - Returns `{ workshop, currency, loading }`.
   - Cleanup removes the channel.

2. **Enable realtime for `workshop_settings`**
   - Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_settings;` (idempotent guard with `DO $$ ... EXCEPTION WHEN duplicate_object`).
   - Existing RLS already allows admins/managers/staff to read the row, so realtime payloads respect access.

3. **`src/pages/invoices/InvoiceCreate.tsx`**
   - Replace the one-shot `supabase.from("workshop_settings")` fetch with `useWorkshopDetails()`.
   - Pass the live `workshop` into `<InvoicePdfPreview workshop={workshop} />`; the existing 350 ms debounce in the preview already re-renders the PDF when props change.

4. **`src/lib/invoicePdf.tsx`**
   - `generateInvoicePDF` (used by Download PDF on `InvoiceDetail`) keeps its own fetch, but switch it to the same column list and accept an optional `workshop` override so callers that already have live data can skip the round trip.

5. **`AdminSettings.tsx`**
   - After a successful save of the General tab, emit a lightweight `toast.success("Company details updated — invoices will refresh")` (purely UX confirmation; the realtime subscription does the actual refresh elsewhere).
   - No structural redesign of the form; the fields already exist.

## Out of scope

- No changes to customer-facing branding/footers.
- No changes to PDF layout itself.
- No new admin permissions or RLS rules.

## Verification

- `getRoleDashboardPath` unit test (4 roles + null).
- Manual: open Create Invoice in one tab, edit address/phone/logo in `/admin/settings` in another tab, confirm the live preview header updates within ~1 s.
