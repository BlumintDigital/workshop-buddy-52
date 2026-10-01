-- How often people open the in-app help, per page. Shoplane Control reads the totals through
-- admin-api (action "help-usage") to see which pages people find hard.
--
-- One row per person, page and day with an open count. Nobody reads this table from the app:
-- writes go through log_help_view(), and only totals (never user ids) leave via admin-api.

create table if not exists public.help_views (
  user_id uuid not null references auth.users (id) on delete cascade,
  page_key text not null check (page_key ~ '^[a-z0-9-]{1,48}$'),
  viewed_on date not null default current_date,
  opens integer not null default 1 check (opens > 0),
  role text,
  primary key (user_id, page_key, viewed_on)
);

create index if not exists help_views_viewed_on_idx on public.help_views (viewed_on, page_key);

alter table public.help_views enable row level security;

-- No permissive policies: the table is closed to every API role. The restrictive 2FA policy is
-- added anyway, as the security hardening requires for every new table.
create policy "Session must have passed 2FA" on public.help_views
  as restrictive for all to authenticated
  using ((select public.session_verified()))
  with check ((select public.session_verified()));

create or replace function public.log_help_view(p_page_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  perform public.assert_verified_session();
  if p_page_key is null or p_page_key !~ '^[a-z0-9-]{1,48}$' then
    raise exception 'invalid page key' using errcode = '22023';
  end if;

  insert into public.help_views (user_id, page_key, viewed_on, opens, role)
  values (v_uid, p_page_key, current_date, 1, public.get_user_role(v_uid)::text)
  on conflict (user_id, page_key, viewed_on)
  do update set opens = least(public.help_views.opens + 1, 1000);
end;
$$;

revoke all on function public.log_help_view(text) from public, anon;
grant execute on function public.log_help_view(text) to authenticated;
