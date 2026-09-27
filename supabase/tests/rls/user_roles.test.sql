-- RLS regression: user_roles
-- Privilege-escalation tests: a manager must not be able to grant the
-- admin role to themselves or anyone else, but can manage staff and clients.

begin;
select plan(4);

-- Real people to test with (signup trigger creates their profile and role).
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-manager@example.test', 'x', now(), '{"role":"manager","full_name":"RLS Manager"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-staff@example.test', 'x', now(), '{"role":"staff","full_name":"RLS Staff"}', '{}', now(), now());

-- Impersonate the manager, signed in with two-step verification.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000b1', 'role', 'authenticated', 'aal', 'aal2')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$ insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000b1', 'admin') $$,
  '42501', null,
  'manager cannot insert admin role for themselves'
);

select throws_ok(
  $$ update public.user_roles set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000c1' $$,
  '42501', null,
  'manager cannot promote another user to admin'
);

select lives_ok(
  $$ update public.user_roles set role = 'client' where user_id = '00000000-0000-0000-0000-0000000000c1' $$,
  'manager can move a staff member to client'
);

reset role;
select is(
  (select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000c1'),
  'client',
  'the staff member ends up a client, never an admin'
);

select * from finish();
rollback;
