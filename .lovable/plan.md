## 1. Source-request link, everywhere it matters

Right now only JobDetail shows a tiny "View request" link, and it points to the queue, not the specific request.

- **JobDetail**: keep the banner, but link to `/admin/requests?focus=<source_request_id>` so the queue scrolls to and highlights the right row. Show it for admin and manager only (clients still see the request inside My Requests).
- **AdminRequests**: read `?focus=<id>` on mount, expand the request card, scroll it into view, and apply a temporary ring/highlight for ~2 seconds.
- **AdminJobs / ManagerJobs list**: if a job has `source_request_id`, add a small "From request" pill next to the title so it's visible without opening the job.
- **InvoiceDetail (admin/manager)**: when the invoice's job has `source_request_id`, show a one-line "Originated from a client request → View" link.
- **ClientRequests**: when a converted request also has invoices, show "View invoice" beside "View job" so the client can trace the full chain from their side.

## 2. Send-to-client workflow for invoices

Today an admin/manager only marks an invoice as "sent" by changing a Select dropdown — easy to miss, no clear action, and the email/notification fire silently as a side effect.

Replace that with an explicit primary action on InvoiceDetail (admin/manager only):

- **Button**: "Send to client" (primary) when status is `draft`, "Resend to client" when status is `sent`/`overdue`. Disabled while sending.
- On click:
  1. Set status to `sent` (and `sent_at = now()` if we add that column — optional, low value, can skip).
  2. Insert in-app notification for the client (`notifications` table) linking to `/client/invoices/<id>`.
  3. Send the existing styled email via `send-email`.
  4. Best-effort push via `send-push` with a short timeout (mirrors the current `notifyClient` pattern).
  5. Show one consolidated toast: "Invoice sent — email + in-app (+ push if delivered)".
- Keep the status Select for edge cases (mark paid, overdue, cancelled) but drop `sent` and `draft` from that dropdown — those transitions happen through Send / payment / overdue triggers, not manual selection.
- Status badge stays for admin/manager.

## 3. Hide invoice jargon from clients

Clients shouldn't see `draft`, `sent`, or internal statuses — only what's actionable for them.

- ClientInvoices list already filters to `sent`, `paid`, `overdue`. Keep that.
- In ClientInvoices and the client-facing InvoiceDetail view:
  - Hide the raw status badge.
  - Replace with friendly labels: `sent` → **"Awaiting payment"**, `overdue` → **"Overdue — please pay"**, `paid` → **"Paid"**, `cancelled` → **"Cancelled"**.
  - Hide the status Select entirely (it was already admin/manager-gated, just confirm).
- The "Notify client" button stays admin/manager-only and never renders for clients.

## 4. Stop the approve/decline loop on quotes

`ClientRequests.decide()` can fire twice — Approve has no disabled-state guard during the network call's first paint, and the AlertDialog's `AlertDialogAction` for decline closes the dialog and the handler also clears state, so a quick double-click on Approve, or React re-running the click handler after state updates, can re-trigger.

Fixes:
- Track `processing` against the request id and **guard the entry of `decide()`**: if `processing === r.id`, return immediately.
- On the Approve button, disable while `processing` is set for any id (not just this row) to prevent racing between two cards.
- In the decline AlertDialog, close the dialog first (`setDeclineFor(null)`), then run the RPC; wrap the action in a single async handler and disable the action button while in-flight.
- Wrap the RPC in `try/finally` so `processing` always resets even on error.
- After a successful decision, optimistically update local state (`status` → `approved` | `declined_by_client`) before refetching, so the Approve/Decline buttons disappear immediately and a stuck UI can't be clicked again.

## Technical details

- No new migrations. Reuse `jobs.source_request_id` and existing `client_requests.converted_job_id`.
- `AdminRequests.tsx`: read `useSearchParams`, scroll target with `scrollIntoView({ behavior: 'smooth', block: 'center' })`, ring via Tailwind `ring-2 ring-primary` toggled off after 2s.
- `JobDetail.tsx`: change link target from `/admin/requests` to `/admin/requests?focus=${job.source_request_id}`.
- `InvoiceDetail.tsx`: extract the existing notify/email logic into a `sendInvoiceToClient()` helper used by the new button; strip `draft` and `sent` from the status Select.
- `ClientInvoices.tsx` + the client view branch of `InvoiceDetail.tsx`: add a `clientFriendlyInvoiceStatus(status)` helper in `src/lib/invoiceStatus.ts` and use it instead of the raw badge.
- `ClientRequests.tsx`: harden `decide()` and the AlertDialog handler as described; no schema change.

## Out of scope

- No changes to the quote-builder or admin requests review flow.
- No changes to the email template (existing styled invoice email is reused).
- No new statuses; just relabeling on the client side.
