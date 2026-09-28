-- RLS regression: "trust this browser" for 2FA.
-- A session vouched for by a trusted browser counts as having passed 2FA, for
-- that user and that session only, until the browser is revoked.

begin;
select plan(7);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000e1', 'trust-a@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000e2', 'trust-b@example.test', 'authenticated', 'authenticated');
insert into public.mfa_trusted_devices (id, user_id, token_hash, expires_at)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'test-hash', now() + interval '30 days');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and (qual ~ 'aal2' or with_check ~ 'aal2')),
  0,
  'no rule tests aal2 directly; they all go through mfa_satisfied()'
);

-- Password only, browser not trusted.
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-00000000a001')::text, true);
set local role authenticated;
select ok(not public.mfa_satisfied(), 'a password-only session has not passed 2FA');
select throws_ok(
  $$ select 1 from public.mfa_trusted_sessions $$,
  '42501', null,
  'signed-in users cannot read trusted sessions'
);

-- The same session once a trusted browser vouched for it.
reset role;
insert into public.mfa_trusted_sessions (session_id, user_id, device_id, expires_at)
values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000e1',
        '00000000-0000-0000-0000-0000000000f1', now() + interval '30 days');
set local role authenticated;
select ok(public.mfa_satisfied(), 'a session from a trusted browser counts as 2FA');

-- Another user presenting that session id gets nothing.
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000e2', 'role', 'authenticated',
  'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-00000000a001')::text, true);
select ok(not public.mfa_satisfied(), 'trust belongs to one user');

-- Revoking the browser ends the trust at once.
reset role;
delete from public.mfa_trusted_devices where id = '00000000-0000-0000-0000-0000000000f1';
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'aal', 'aal1', 'session_id', '00000000-0000-0000-0000-00000000a001')::text, true);
set local role authenticated;
select ok(not public.mfa_satisfied(), 'revoking the browser ends the trust');

-- A 2FA code still works on its own.
select set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated',
  'aal', 'aal2', 'session_id', '00000000-0000-0000-0000-00000000a002')::text, true);
select ok(public.mfa_satisfied(), 'a session that entered a code has passed 2FA');

select * from finish();
rollback;
