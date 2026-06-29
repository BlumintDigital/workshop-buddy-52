## Goal

Make client-initiated quotes follow the correct lifecycle, fix the "Notify client" stuck state, and stop the client portal showing a phantom invoice. Manually-created jobs, quotes, and invoices stay untouched.

## Correct workflow (quote requests)

1. Client submits a **Quote request** from My Requests.
2. Admin/manager opens it and **builds & sends a quote** inline (line items, total, optional expiry & notes). No invoice is created at this point.
3. Client sees the quote in My Requests with **Approve** or **Decline** buttons.
4. Once the client approves, admin/manager sees **Convert to job**, which creates a job (status `pending`).
5. Admin/manager raises the invoice from that job using the existing invoice flow.

Job-type requests keep today's behaviour (Accept → job directly).

```text
Client ──submit quote request──▶ Admin
Admin  ──build & send quote───▶ Client (status: quoted)
Client ──approve/decline──────▶ Admin (status: approved | declined_by_client)
Admin  ──convert to job───────▶ Job created (status: pending)
Admin  ──raise invoice────────▶ existing invoice flow
```

## UI changes

- **AdminRequests.tsx**
  - Quote request, status `pending`: replace the "Send quote" link with a **Build & send quote** action that opens a new `QuoteBuilderDialog`.
  - Status `quoted`: show the quote summary and a "Waiting for client approval" pill.
  - Status `approved`: show **Convert to job** button.
  - Job request: unchanged (Accept & create job).
- **ClientRequests.tsx**
  - Status `quoted`: render quote items, total, expiry, notes, with **Approve quote** and **Decline quote** buttons (decline asks for an optional reason).
  - Status `approved`: show "Waiting for the workshop to schedule the job."
  - Status `converted`: keep existing "View job" button.
- **New** `src/components/requests/QuoteBuilderDialog.tsx` (admin) and `src/components/requests/QuoteReviewCard.tsx` (client).

## Bug fixes

- **Notify client stuck on "Sending…"** (`InvoiceDetail.tsx`):
  - Add a 15s timeout around the `send-push` invoke so the button always resolves.
  - Always also insert an in-app notification (`sendNotification`) and send a transactional email via `send-email`, so the client is reached even when push isn't enabled.
  - Toast separately for push / email / in-app outcomes; success when at least one channel delivers.
- **Client portal shows 1 invoice but blank** (`ClientDashboard.tsx`):
  - The dashboard counts every invoice (including `draft`), but `ClientInvoices.tsx` hides drafts. Align the dashboard query to `status in ('sent','paid','overdue')` so the tile count matches the list. (Unrelated to 2FA.)
- **Quote shown as a raised job**: resolved by the workflow change above — a quote-type request no longer creates a job until the client approves and admin converts.

## Data changes

- New table `public.request_quote_items` (`request_id`, `description`, `quantity`, `unit_price`) + standard timestamps. GRANTs + RLS (client can read items of their own request; admin/manager full; service_role all).
- Add columns to `public.client_requests`: `quoted_total numeric`, `quoted_currency text`, `quoted_notes text`, `quote_expires_at timestamptz`, `client_decision_at timestamptz`.
- Extend the allowed `status` set with `approved` and `declined_by_client` (validated via trigger, not CHECK).
- New RPCs (SECURITY DEFINER):
  - `submit_quote(_request_id uuid, _currency text, _notes text, _expires_at timestamptz, _items jsonb)` — admin/manager only; requires quote-type, status `pending` or `quoted`; replaces items and sets status `quoted`, recalculates `quoted_total`.
  - `client_decide_quote(_request_id uuid, _approve boolean, _reason text)` — caller must equal `client_requests.client_id`; only when status `quoted`; sets `approved` or `declined_by_client` + `client_decision_at`.
- Update `accept_client_request`: for quote-type, require status `approved`; for job-type, behaviour unchanged.

## Out of scope

- No change to manually-raised jobs / quotes / invoices.
- No change to the job-request flow.
- No standalone "quote PDF" — the quote is rendered in the request thread; PDF can come later if needed.
