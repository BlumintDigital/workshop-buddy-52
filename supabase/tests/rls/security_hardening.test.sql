-- Regression: fixes from the September 2026 security audit.
-- Sign-up can't choose its role, 2FA is enforced by the database, staff can't
-- reassign projects, and small information leaks are closed.

begin;
select plan(21);

-- ---------------------------------------------------------------- sign-up
insert into public.signup_codes (code, role, active, max_uses, uses_count)
values ('SEC-ADMIN-CODE', 'admin', true, 1, 0),
       ('SEC-CLIENT-CODE', 'client', true, 5, 0);

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ('00000000-0000-0000-0000-00000000c001', 'no-code@example.test', 'authenticated', 'authenticated',
             '{"role":"admin","full_name":"Intruder"}') $$,
  '42501', null,
  'a sign-up without an invite code is refused, whatever role it asks for'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000c002', 'open-code@example.test', 'authenticated', 'authenticated',
        '{"role":"admin","signup_code":"SEC-CLIENT-CODE"}');
select is((select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000c002'),
  'client', 'a client code gives a client, even when the sign-up asks for admin');

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000c003', 'staff-pick@example.test', 'authenticated', 'authenticated',
        '{"role":"staff","signup_code":"sec-client-code"}');
select is((select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000c003'),
  'client', 'codes are matched without regard to case, and the code still decides the role');

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000c004', 'admin-code@example.test', 'authenticated', 'authenticated',
        '{"signup_code":"SEC-ADMIN-CODE"}');
select is((select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000c004'),
  'admin', 'an admin invite code makes an admin');
select is((select uses_count from public.signup_codes where code = 'SEC-ADMIN-CODE'), 1,
  'the code is used up by the sign-up itself');

select throws_ok(
  $$ insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ('00000000-0000-0000-0000-00000000c005', 'second@example.test', 'authenticated', 'authenticated',
             '{"signup_code":"SEC-ADMIN-CODE"}') $$,
  '42501', null,
  'a used-up code is refused'
);

select public.provision_account('Provisioned@Example.test', 'manager');
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-0000-0000-00000000c006', 'provisioned@example.test', 'authenticated', 'authenticated',
        '{"role":"admin"}');
select is((select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000c006'),
  'manager', 'an account announced by server code gets the announced role, not the requested one');

select ok(not has_function_privilege('authenticated', 'public.provision_account(text, public.app_role)', 'EXECUTE'),
  'signed-in users cannot announce accounts');
select ok(not has_function_privilege('anon', 'public.peek_signup_code(text)', 'EXECUTE'),
  'visitors cannot test codes directly');

-- ---------------------------------------------------------------- 2FA everywhere
-- c004 is an admin; c003 is a client with no 2FA; c006 is a manager.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000c004',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000d0001')::text, true);
set local role authenticated;
select ok(not public.session_verified(), 'an admin with only a password has not passed 2FA');
select ok(not public.has_role('00000000-0000-0000-0000-00000000c004', 'admin'),
  'role checks about yourself fail until 2FA is passed');
select is_empty($$ select 1 from public.signup_codes $$, 'a password-only admin sees no invite codes');
select is_empty($$ select 1 from public.appointments $$, 'a password-only admin sees no appointments');
select throws_ok($$ select public.set_feature_flag('goals', false) $$, '42501', null,
  'a password-only admin cannot run admin functions');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000c004',
  'role', 'authenticated', 'aal', 'aal2', 'session_id', '00000000-0000-0000-0000-0000000d0002')::text, true);
select ok(public.has_role('00000000-0000-0000-0000-00000000c004', 'admin'), 'after 2FA the admin role counts');
select isnt_empty($$ select 1 from public.signup_codes $$, 'after 2FA the admin sees invite codes');

-- Backup code sessions count.
reset role;
insert into public.mfa_trusted_sessions (session_id, user_id, device_id, via, expires_at)
values ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-00000000c004', null, 'backup_code', now() + interval '1 hour');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000c004',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000d0003')::text, true);
set local role authenticated;
select ok(public.session_verified(), 'a session that used a backup code has passed 2FA');

-- Staff without 2FA switched on are not asked for it.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000c003',
  'role', 'authenticated', 'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-0000000d0004')::text, true);
select ok(public.session_verified(), 'people who have not turned 2FA on (and are not admins or managers) are not blocked');

-- ---------------------------------------------------------------- small leaks
select is(public.get_user_role('00000000-0000-0000-0000-00000000c004'), null,
  'ordinary users cannot look up someone else''s role');
select is(public.get_user_role('00000000-0000-0000-0000-00000000c003')::text, 'client',
  'anyone can look up their own role');
reset role;
select ok(not has_function_privilege('anon', 'public.can_run_job(uuid)', 'EXECUTE'),
  'visitors cannot probe job permissions');

select * from finish();
rollback;
