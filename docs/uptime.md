# Uptime Monitoring

External uptime monitoring lives outside the app so it keeps reporting when
Supabase, Vercel, or the deployed bundle itself is unhealthy.

## Recommended setup

| Item | Value |
|------|-------|
| Provider | BetterUptime, UptimeRobot, or Pingdom |
| Target URL | `https://<your-domain>/` |
| Check type | HTTPS GET, expect status `200` |
| Interval | 1 minute (free tier usually allows this) |
| Alert channels | Email + (optional) SMS / Slack to the on-call admin |
| Target uptime | 99.9% rolling 30 days (≈ 43 m downtime / month) |

## What "healthy" means

A 200 from the SPA root means Vercel served `index.html`. It does **not**
prove Supabase is reachable. Add a second check against the Supabase REST
health endpoint:

`https://<project-ref>.supabase.co/auth/v1/health` — expect status `200`.

## Incident flow

1. Monitor fires → email + on-call paged.
2. Follow `docs/incident-response.md` § "Site down".
3. Post status update if downtime > 5 minutes.
4. After resolution, file a post-mortem in `docs/incident-response.md` log.

## Self-check route

The SPA does not expose a dedicated `/health` endpoint because every route is
client-rendered and depends on Supabase. Use the root URL plus the Supabase
auth health URL above for monitoring.
