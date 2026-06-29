-- RLS regression: user_roles
-- Privilege-escalation tests: a manager must not be able to grant the
-- admin role to themselves or anyone else.

begin;
select plan(2);

-- Impersonate a manager.
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '00000000-0000-0000-0000-0000000000b1',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

-- Attempt to self-assign admin.
select throws_ok(
  $$ insert into public.user_roles (user_id, role)
     values ('00000000-0000-0000-0000-0000000000b1', 'admin') $$,
  null,
  null,
  'manager cannot insert admin role for themselves'
);

-- Attempt to change someone else's role to admin via UPDATE.
select throws_ok(
  $$ update public.user_roles
       set role = 'admin'
     where user_id = '00000000-0000-0000-0000-0000000000c1' $$,
  null,
  null,
  'manager cannot promote another user to admin'
);

select * from finish();
rollback;
