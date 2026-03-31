ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT false;

ALTER TABLE public.workshop_settings
ADD COLUMN IF NOT EXISTS from_email TEXT DEFAULT NULL;