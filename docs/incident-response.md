# Incident Response Runbook

**Owner:** Platform Security (security@example.com)
**Review cadence:** Annually, or after any P1/P2 incident

---

## Severity Tiers

| Level | Definition | Response SLA |
|-------|------------|-------------|
| P1 — Critical | Data breach, full service outage, active exploitation | Acknowledge within 1h; status update every 2h |
| P2 — High | Partial service outage, suspected unauthorised access, data integrity issue | Acknowledge within 4h; status update every 6h |
| P3 — Medium | Non-critical service degradation, policy violation | Acknowledge within 1 business day |
| P4 — Low | Minor bugs, performance issues, non-security observations | Acknowledge within 3 business days |

---

## Detection Sources

| Source | What it catches | How to access |
|--------|----------------|---------------|
| Sentry | Frontend JavaScript errors, unhandled exceptions | sentry.io dashboard |
| Supabase logs | Edge function errors, database slow queries, auth failures | Supabase Dashboard → Logs |
| Anomaly detection (Admin UI) | Role escalations, bulk deletes, feature flag changes in last 24–72h | Admin → Activity Logs |
| `activity_logs` table | All data mutations | Supabase Studio or Admin → Activity Logs |
| User reports | Bug reports via "Report an Issue" page → delivered to `security@example.com` | Email inbox |
| Uptime monitoring | Service availability | BetterUptime / UptimeRobot alerts |

---

## Response Steps

### 1. Triage (0–30 min)
- [ ] Confirm the incident is real (not a false positive)
- [ ] Assign an incident commander
- [ ] Determine severity tier (P1–P4)
- [ ] Create an incident record (Slack thread, Notion page, or text file) capturing: time detected, reporter, initial description

### 2. Contain (30 min – 2h)
- [ ] If a user account is compromised: deactivate via Admin → Users → Access Review, or call `admin-toggle-user` edge function
- [ ] If the `GLOBAL_ADMIN_SECRET` is exposed: rotate it in Supabase Edge Function secrets and redeploy `admin-api`
- [ ] If a Resend API key is exposed: revoke in Resend dashboard; rotate in Supabase secrets; redeploy `send-email`
- [ ] If data was deleted: check Supabase backups (Dashboard → Database → Backups); restore to point before incident
- [ ] If edge function is being abused: temporarily disable it (Supabase Dashboard → Edge Functions → Pause)

### 3. Notify
- [ ] **P1/P2:** Notify affected users within 72 hours (UK GDPR Article 34 requirement if personal data is involved)
- [ ] **P1:** Notify the ICO within 72 hours of becoming aware if a personal data breach is likely to affect individuals' rights and freedoms (UK GDPR Article 33)
- [ ] Internal stakeholders: notify via `security@example.com` thread

ICO report portal: https://ico.org.uk/for-organisations/report-a-breach/

### 4. Remediate
- [ ] Patch the root cause
- [ ] Deploy fix (edge function deploy or frontend deploy)
- [ ] Verify fix via testing and log review
- [ ] Re-enable any temporarily disabled features

### 5. Post-Mortem (within 5 business days for P1/P2)
- [ ] Document: timeline, root cause, impact, resolution, prevention measures
- [ ] Update this runbook if process gaps were found
- [ ] Add any new anomaly detection rules to `AdminActivityLogs.tsx`

---

## Key Contacts

| Role | Contact |
|------|---------|
| Security incidents | security@example.com |
| Privacy/GDPR | privacy@example.com |
| Platform (Supabase) | support.supabase.com |
| Hosting (Vercel) | vercel.com/support |
| Email delivery (Resend) | resend.com/support |
| ICO (UK data regulator) | ico.org.uk / 0303 123 1113 |

---

## Evidence Preservation

For any P1/P2 incident:
1. Export `activity_logs` for the affected time window via Admin → Activity Logs → Export CSV
2. Download Supabase function logs from Dashboard → Logs → Edge Functions
3. Screenshot Sentry error details
4. Do not delete or modify any logs before export
