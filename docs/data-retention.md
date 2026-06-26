# Data Retention Policy

**Owner:** Blumint Digital Limited
**Effective date:** June 2026
**Review cadence:** Annually

---

## Overview

This policy defines how long Workshop Manager retains personal and business data, and the process for deleting it. Retention periods balance legal obligations with minimising unnecessary data storage.

---

## Retention Schedule

| Data category | Table(s) | Retention period | Legal basis |
|--------------|----------|-----------------|-------------|
| User accounts and profiles | `auth.users`, `profiles` | Duration of account + 30 days after closure | Contract |
| User roles | `user_roles` | Duration of account | Contract |
| Jobs | `jobs`, `job_tasks`, `job_updates` | 7 years from job close date | UK HMRC — financial records |
| Invoices | `invoices`, `invoice_items` | 7 years from invoice date | UK HMRC — financial records |
| Appointments | `appointments` | 3 years | Legitimate interest (service history) |
| Inventory | `inventory_items` | Duration of service + 1 year | Legitimate interest |
| Audit logs | `activity_logs` | 2 years | Legitimate interest (security) |
| Push notification subscriptions | `push_subscriptions` | Until user unsubscribes or account closes | Consent |
| MFA trusted devices | `mfa_trusted_devices` | 30 days (cookie Max-Age) | Contract |
| MFA rate limits | `mfa_rate_limits` | 24 hours (automatic expiry) | Contract |
| Broadcast banners | `broadcasts` | Until manually deleted | Legitimate interest |
| Emails sent | Resend delivery logs | Per Resend's policy (not stored in our DB) | Contract |
| Error reports (Sentry) | Sentry | 90 days (Sentry default) | Legitimate interest |

---

## Deletion Procedure

### Account closure (user request)
1. Admin deactivates the account via Admin → Users → Access Review
2. After 30 days, delete the `auth.users` entry via Supabase Dashboard → Authentication → Users → Delete
3. Profile data cascades via `ON DELETE CASCADE` to `profiles`, `user_roles`, `mfa_trusted_devices`
4. Financial records (jobs, invoices) are retained for 7 years per HMRC obligation — the `client_id` foreign key becomes NULL on profile deletion
5. Document the deletion in the `activity_logs` (auto-captured by DB trigger)

### Scheduled purge (automated — not yet implemented)
A quarterly cron job or manual query should delete:
- `activity_logs` rows older than 2 years
- `appointments` older than 3 years with no linked jobs or invoices

### Right to erasure (UK GDPR Article 17)
When a user submits an erasure request (to privacy@shoplane.uk):
1. Verify identity
2. Check whether financial record retention obligation overrides the request (HMRC 7-year rule)
3. Delete account per the "account closure" procedure above
4. Confirm in writing within 30 days

---

## Supabase Backup Retention

- **Automated backups:** Supabase creates daily backups (retained 7 days on free plan; up to 30 days on Pro)
- **Point-in-Time Recovery (PITR):** Available on Supabase Pro and above; enables restore to any second within the PITR window
- Verify backup configuration in: Supabase Dashboard → Database → Backups

---

## Exceptions

Retention may be extended beyond the periods above if:
- Data is subject to a legal hold or regulatory investigation
- Deletion would destroy evidence needed for a pending legal claim
