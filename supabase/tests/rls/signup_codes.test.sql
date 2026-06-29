-- RLS regression: signup_codes
-- Only admins may create signup codes that grant elevated roles.

begin;
select plan(2);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-0000000000d1',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- Anon cannot list codes.
reset role;
set local role anon;
select is_empty(
  $$ select id from public.signup_codes limit 1 $$,
  'anon cannot list signup codes'
);

-- A manager attempting to mint an admin-role code is denied.
set local role authenticated;
select throws_ok(
  $$ insert into public.signup_codes (code, role, active)
     values ('TEST-ADMIN-CODE', 'admin', true) $$,
  null,
  null,
  'non-admin cannot create admin-role signup code'
);

select * from finish();
rollback;
