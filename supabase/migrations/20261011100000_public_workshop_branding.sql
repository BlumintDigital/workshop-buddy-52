-- Workshop branding for everyone who uses a workshop's site, not only admins and managers.
--
-- workshop_settings_public is a security_invoker view over workshop_settings, whose RLS only lets
-- admins and managers read. Staff, clients and the signed-out sign-in page therefore got no row:
-- they saw the "Shoplane" fallback name, no logo, the default sign-in photo and default colours.
--
-- This function returns only the fields meant for display. It is SECURITY DEFINER so it can read
-- the row, and it deliberately does not call assert_verified_session(): the sign-in and password
-- reset pages need the workshop's name, logo and photo before anyone has signed in.
-- Contact details (printed on invoices and reports) are returned to signed-in users only.

create or replace function public.get_public_workshop_settings()
returns table (
  id integer,
  workshop_name text,
  logo_url text,
  login_image_url text,
  currency text,
  vapid_public_key text,
  brand_primary_hsl text,
  brand_accent_hsl text,
  enabled_currencies text[],
  address text,
  phone text,
  contact_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws.id,
    ws.workshop_name,
    ws.logo_url,
    ws.login_image_url,
    ws.currency,
    (select wac.vapid_public_key from public.workshop_admin_contacts wac where wac.id = 1),
    ws.brand_primary_hsl,
    ws.brand_accent_hsl,
    ws.enabled_currencies,
    case when auth.uid() is not null then ws.address end,
    case when auth.uid() is not null then ws.phone end,
    case when auth.uid() is not null then ws.contact_email end
  from public.workshop_settings ws
  where ws.id = 1;
$$;

revoke all on function public.get_public_workshop_settings() from public;
grant execute on function public.get_public_workshop_settings() to anon, authenticated;

-- Same view name and first six columns as before, so existing readers keep working; the new
-- columns are appended. The view stays security_invoker; the function decides what is visible.
create or replace view public.workshop_settings_public
with (security_invoker = true)
as
select * from public.get_public_workshop_settings();

grant select on public.workshop_settings_public to anon, authenticated;
