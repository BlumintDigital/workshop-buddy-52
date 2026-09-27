# Supabase database tests

These tests run against the local test database (see `supabase-test/README.md`).

## Run locally

```bash
npm run test-db:start   # once: start the test database
npm run test-db:reset   # rebuild it from the production schema
npm run test-db:rls     # run every *.sql file under supabase/tests/
```

Each file creates the people it needs inside its transaction and rolls back,
so it leaves nothing behind. CI runs the same command on every push.

## Layout

- `rls/` — pgTAP specs asserting Row Level Security policies for each
  user-facing table. Each spec uses `set_config('request.jwt.claims', ...)`
  to impersonate roles (`anon`, `authenticated` admin, manager, staff, client)
  and verifies who can SELECT/INSERT/UPDATE/DELETE.

## Writing a new spec

```sql
begin;
select plan(4);

-- Impersonate an authenticated client user.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true);
set local role authenticated;

select lives_ok($$ select * from public.profiles where id = auth.uid() $$,
  'client can read own profile');

select throws_ok($$ select * from public.user_roles $$, '42501',
  'client cannot read user_roles directly');

select * from finish();
rollback;
```

The CI job under `.github/workflows/ci.yml` boots `supabase start` and runs
this suite on every PR.
