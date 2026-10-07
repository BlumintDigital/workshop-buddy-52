-- Regression: project_people()
-- Staff who can see a project get its client (with contact details) and project lead,
-- without being able to read profiles directly. Anyone who can't see the project gets
-- nothing, visitors can't call it, and an admin who owes a 2FA code is refused.

begin;
select plan(10);

-- People: a reception staff member, a staff member with no permissions, the project lead,
-- the project's client, another client, and an admin.
select public.provision_account('pp-reception@example.test', 'staff'),
       public.provision_account('pp-plain@example.test', 'staff'),
       public.provision_account('pp-lead@example.test', 'staff'),
       public.provision_account('pp-client@example.test', 'client'),
       public.provision_account('pp-other@example.test', 'client'),
       public.provision_account('pp-admin@example.test', 'admin');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp-reception@example.test', 'x', now(), '{"full_name":"Rita Reception"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp-plain@example.test', 'x', now(), '{"full_name":"Pat Plain"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp-lead@example.test', 'x', now(), '{"full_name":"Lee Lead"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp-client@example.test', 'x', now(), '{"full_name":"Cara Client"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e0005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp-other@example.test', 'x', now(), '{"full_name":"Otto Other"}', '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000e0006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pp-admin@example.test', 'x', now(), '{"full_name":"Ada Admin"}', '{}', now(), now());

update public.profiles set phone = '07700 900123', company_name = 'Cara Ltd' where id = '00000000-0000-0000-0000-0000000e0004';
insert into public.user_permissions (user_id, permission) values ('00000000-0000-0000-0000-0000000e0001', 'reception');
insert into public.jobs (id, title, client_id, assigned_staff_id, received_by)
values ('00000000-0000-0000-0000-0000000e1001', 'People test project',
        '00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-0000000e0001');

-- ---------------------------------------------------------------- reception staff
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0001',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000e2001')::text, true);
set local role authenticated;

select is_empty($$ select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000e0004' $$,
  'reception staff still cannot read the client''s profile directly');
select results_eq(
  $$ select full_name, company_name, phone, email from public.project_people('00000000-0000-0000-0000-0000000e1001') where person = 'client' $$,
  $$ values ('Cara Client'::text, 'Cara Ltd'::text, '07700 900123'::text, 'pp-client@example.test'::text) $$,
  'reception staff get the client''s name and contact details');
select results_eq(
  $$ select full_name, phone from public.project_people('00000000-0000-0000-0000-0000000e1001') where person = 'lead' $$,
  $$ values ('Lee Lead'::text, null::text) $$,
  'reception staff get the project lead''s name, without contact details');
select results_eq(
  $$ select full_name from public.project_people('00000000-0000-0000-0000-0000000e1001') where person = 'received_by' $$,
  $$ values ('Rita Reception'::text) $$,
  'reception staff get who received the project');

-- ---------------------------------------------------------------- the project lead
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0003',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000e2003')::text, true);
select results_eq(
  $$ select full_name from public.project_people('00000000-0000-0000-0000-0000000e1001') where person = 'client' $$,
  $$ values ('Cara Client'::text) $$,
  'the project lead gets the client''s name');

-- ---------------------------------------------------------------- people who can't see it
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0002',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000e2002')::text, true);
select is_empty($$ select 1 from public.project_people('00000000-0000-0000-0000-0000000e1001') $$,
  'staff who cannot see the project get nobody');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0005',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000e2005')::text, true);
select is_empty($$ select 1 from public.project_people('00000000-0000-0000-0000-0000000e1001') $$,
  'another client gets nobody');

-- ---------------------------------------------------------------- 2FA
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0006',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000e2006')::text, true);
select throws_ok($$ select * from public.project_people('00000000-0000-0000-0000-0000000e1001') $$, '42501', null,
  'an admin who has not passed 2FA is refused');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000e0006',
  'role', 'authenticated', 'aal', 'aal2', 'session_id', '00000000-0000-0000-0000-0000000e2007')::text, true);
select is((select count(*)::int from public.project_people('00000000-0000-0000-0000-0000000e1001')), 3,
  'after 2FA the admin gets the client, lead and receiver');

-- ---------------------------------------------------------------- visitors
reset role;
select ok(not has_function_privilege('anon', 'public.project_people(uuid)', 'EXECUTE'),
  'visitors cannot call project_people');

select * from finish();
rollback;
