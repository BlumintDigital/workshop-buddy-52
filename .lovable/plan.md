
## Goal

When an admin/manager accepts a client request in `AdminRequests.tsx` and it is converted to a job, send the requesting client both an in-app notification and a branded email linking to the new job.

## Scope

Single touchpoint: the `accept()` handler in `src/pages/admin/AdminRequests.tsx`, which already calls the `accept_client_request` RPC and receives the new `job_id`. This is the only place a request → job conversion happens. The same trigger also covers approved-quote conversions, since those flow through the same RPC.

Out of scope: the client's own quote approve/decline action (that already shows a toast and is between the client and the workshop), declines by admin (no job created), and push notifications (separate stack, not requested).

## Changes

1. **`src/pages/admin/AdminRequests.tsx`** — after a successful `accept_client_request` call:
   - Insert an in-app notification for `r.client_id` via the existing `sendNotification` helper:
     - title: "Your request was approved"
     - message: ``Your ${quote|job} request "<title>" is now job #<short id>.``
     - link: `/jobs/<job_id>` (client portal route — confirm exact path; clients view jobs at `/client/jobs/:id` if applicable, otherwise `/jobs/:id`).
   - Send a branded email to the client via `sendEmail({ to_user_id: r.client_id, subject, html })` using a new template helper.
   - Both calls are fire-and-forget (the helpers already swallow errors) so the admin's success toast and navigation aren't blocked.

2. **`src/lib/email.ts`** — add a new template `requestApprovedEmailHtml(requestTitle, jobLink)` that matches the look of the existing `jobStatusEmailHtml` / `quoteReadyEmailHtml` helpers (workshop-neutral, system-font card, dark CTA). Copy: "Your request has been approved — we've opened a job to track the work. Click below to follow progress."

## Verification

- Approve a pending job request as admin → client sees a bell notification and receives the email; the link opens the new job.
- Approve a client-approved quote → same outcome (the RPC returns a `job_id` in this path too).
- Decline a request → no notification/email sent (unchanged behaviour).

## Notes

- No DB migration, no edge function changes — the `notifications` table and `send-email` function already exist and are used elsewhere for exactly this pattern.
- Email delivery still respects the workshop's `email_notifications_enabled` flag (enforced server-side in `send-email`).
