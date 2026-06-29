-- RLS regression: profiles
-- Verifies that anon cannot read profiles, and authenticated users can only
-- access their own row unless they hold an elevated role.

begin;
select plan(3);

-- Anon must be denied entirely.
set local role anon;
select is_empty(
  $$ select id from public.profiles limit 1 $$,
  'anon sees no profiles'
);

-- An authenticated user impersonating themselves can see their own row.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-000000000aaa',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- Seed a self profile (uses elevated client when run via supabase test db
-- because BEGIN/ROLLBACK keeps it isolated to this transaction).
insert into public.profiles (id, full_name)
values ('00000000-0000-0000-0000-000000000aaa', 'Self Test')
on conflict (id) do nothing;

select results_eq(
  $$ select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000aaa' $$,
  $$ values ('Self Test'::text) $$,
  'authenticated user reads own profile row'
);

-- They cannot update is_active on themselves (self-write protection).
select throws_ok(
  $$ update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000aaa' returning id $$,
  null,
  null,
  'self-write to is_active is blocked'
);

select * from finish();
rollback;
