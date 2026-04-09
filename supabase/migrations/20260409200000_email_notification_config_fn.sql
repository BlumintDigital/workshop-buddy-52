-- SECURITY DEFINER function so any authenticated user can retrieve
-- just the email notification flag and recipient without exposing
-- the full workshop_settings table via RLS.
CREATE OR REPLACE FUNCTION public.get_email_notification_config()
RETURNS TABLE (email_notifications_enabled boolean, recipient_email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ws.email_notifications_enabled,
    COALESCE(ws.super_admin_email, ws.contact_email) AS recipient_email
  FROM workshop_settings ws
  WHERE ws.id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_notification_config() TO authenticated;
