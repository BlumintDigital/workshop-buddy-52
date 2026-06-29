
## Goal

Let clients submit a **Quote Request** or a **Job Request** from the portal, track them on a new **My Requests** page, and give admins/managers a review queue to accept (converts to a real job) or decline. Appointments stay untouched.

## User-facing changes

### Client portal
- New sidebar entry **My Requests** (`/client/requests`).
- **+ New Request** button opens a dialog with a toggle: **Request a Quote** / **Request a Job**.
  - Fields: title, description, preferred date (optional), priority (low/medium/high), attachments (optional, reuses job-attachments bucket).
  - Helper text clarifies the difference: a quote returns a price estimate first; a job request asks the workshop to start work.
- Requests list shows status pill: `Pending`, `Quoted`, `Accepted`, `Declined`, `Converted to Job` (with link to the job once converted).
- Client dashboard gets a small "Open requests" tile linking here.
- Clarifying copy added to the existing client Appointments page: "Appointments are for consultations or site visits. To request work, use **My Requests**."

### Admin / Manager
- New sidebar entry **Requests** under operations (`/admin/requests`, `/manager/requests`) with a badge for pending count.
- Each row: client, type (Quote / Job), title, submitted at, status, actions.
- Detail drawer with actions:
  - **Accept & create job** — converts to a row in `jobs` (status `pending` for job requests, `quote` for quote requests, reusing the existing `quote` status already used by `CreateJobDialog`). Links the new job back to the request.
  - **Decline** — requires a short reason, emailed to client.
  - **Send quote** (quote requests only) — opens existing Invoice Create flow prefilled with client + request line item; on send, request flips to `Quoted`.
- In-app notification + email to client on every status change.

## Data model

New table `client_requests`:
- `client_id` (profile id of submitter)
- `request_type` ('quote' | 'job')
- `title`, `description`, `priority`, `preferred_date`
- `status` ('pending' | 'quoted' | 'accepted' | 'declined' | 'converted')
- `decline_reason`, `converted_job_id` (FK → jobs), `quoted_invoice_id` (FK → invoices)
- standard `created_at` / `updated_at`

RLS:
- Client: `SELECT/INSERT` own rows (`client_id = auth.uid()`), `UPDATE` only to cancel while `pending`.
- Admin/manager: full `SELECT/UPDATE`.
- Service role: full.
- GRANTs to `authenticated` and `service_role` (no `anon`).

Attachments reuse the existing `job-attachments` bucket with a `request/{request_id}/...` prefix and matching RLS.

Triggers:
- `updated_at` trigger.
- `activity_logs` trigger on insert/status change.

## Conversion flow

On **Accept & create job**:
1. Insert into `jobs` with `client_id`, `title`, `description`, `priority`, `due_date = preferred_date`, `status = 'quote'` for quote-type or `'pending'` for job-type.
2. Update `client_requests.status = 'converted'`, set `converted_job_id`.
3. Notify client (in-app + email) with link to job.

Handled in a SECURITY DEFINER RPC `accept_client_request(_request_id, _assigned_staff_id?)` so the single transaction enforces admin/manager check and bypasses the client-only insert path on `jobs`.

## Files to add / edit

New:
- `supabase/migrations/<ts>_client_requests.sql` (table + grants + RLS + RPC + triggers).
- `src/pages/client/ClientRequests.tsx` (list + new-request dialog).
- `src/components/client/NewRequestDialog.tsx`.
- `src/pages/admin/AdminRequests.tsx` (shared component reused for `/manager/requests`).
- `src/components/requests/RequestDetailDrawer.tsx`.
- `src/hooks/usePendingRequestCount.ts` (sidebar badge).

Edit:
- `src/App.tsx` — routes for `/client/requests`, `/admin/requests`, `/manager/requests`.
- `src/components/layout/AppSidebar.tsx` — new entries + pending badge for admin/manager.
- `src/pages/client/ClientDashboard.tsx` — "Open requests" tile.
- `src/pages/client/ClientAppointments.tsx` — helper banner pointing to My Requests.
- `docs/user-guide.md` and `src/pages/Help.tsx` — document the new flow for each role.

## Out of scope

- No changes to appointments schema or flows.
- No payment changes; quoting reuses existing invoice creation.
- No realtime push for the new table beyond existing notification channels.
