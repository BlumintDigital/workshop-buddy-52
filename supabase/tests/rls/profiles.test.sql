-- RLS regression: profiles
-- Anon cannot read profiles; a signed-in person reads only their own row
-- (unless they hold an elevated role) and cannot switch their own account
-- on or off.

begin;
select plan(4);

-- Real people to test with (signup trigger creates their profiles).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000aaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-self@example.test', 'x', now(), '{"role":"client","full_name":"Self Test"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000bbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-other@example.test', 'x', now(), '{"role":"client","full_name":"Other Client"}', '{}', now(), now());

-- Anon must be denied entirely.
set local role anon;
select is_empty(
  $$ select id from public.profiles limit 1 $$,
  'anon sees no profiles'
);
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000aaa', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select results_eq(
  $$ select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000aaa' $$,
  $$ values ('Self Test'::text) $$,
  'a client reads their own profile'
);

select is_empty(
  $$ select id from public.profiles where id = '00000000-0000-0000-0000-000000000bbb' $$,
  'a client cannot read another client''s profile'
);

select throws_ok(
  $$ update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000aaa' $$,
  '42501', null,
  'a client cannot switch their own account off'
);

select * from finish();
rollback;
