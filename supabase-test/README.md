# Test database

A local copy of Shoplane's database for end-to-end tests, so test runs never
write to production. It runs in Docker next to anything else, on its own ports
(API 55321, database 55322, Studio 55323, email inbox 55324).

## Everyday use

```bash
npm run test-db:start   # start it (first time: also downloads the Docker images)
npm run test-db:reset   # wipe it and rebuild: schema, settings, the four test people
npm run test:e2e        # run the whole suite against it (starts the app on :8081)
npm run test-db:stop    # stop it when you're done
```

`npm run dev:test` runs the app on http://localhost:8081 against the test
database, if you want to click around by hand. Sign in with the test accounts
from `.env.e2e`. Emails the app sends land in the local inbox at
http://127.0.0.1:55324, not in anyone's mailbox.

`npm run test:e2e:prod` runs only the read-only checks (sign-in, route guards,
accessibility) against the live app. Nothing else touches production.

On Windows, Docker Desktop often can't see files on drives other than C:, so
the scripts run the stack from a copy in `~/.shoplane/test-db`, refreshed from
this folder on every start and reset. Edit the files here, not the copy.

## What's in it

- `supabase/migrations/20260101000000_baseline_schema.sql`: production's
  schema (tables, functions, policies; no data), dumped with
  `npx supabase db dump --linked --schema public`.
- `20260101000001_auth_trigger.sql` and `20260101000002_storage.sql`: the
  signup trigger and file-storage buckets and rules, which live outside the
  public schema.
- `supabase/seed.sql`: workshop settings and feature switches.
- Every migration in `../supabase/migrations` newer than the baseline is
  copied in and applied on reset, so new migrations are tested here before
  they go to production.
- The edge functions are copied from `../supabase/functions` on start and reset.
- `scripts/test-db.mjs` adds Demo Admin, Demo Manager, Demo Staff and Demo
  Client using the emails and passwords in `.env.e2e`, and writes
  `.env.testdb.local` (the local URL and keys, not committed).

## Refreshing the baseline

When the list of newer migrations gets long, dump production's schema again
into `20260101000000_baseline_schema.sql` and set `BASELINE_VERSION` in
`scripts/test-db.mjs` to the newest migration it now includes.
