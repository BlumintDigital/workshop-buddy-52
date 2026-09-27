-- Test database only: the settings rows production already has. People and
-- sample records are added by `npm run test-db:reset` (scripts/test-db.mjs),
-- which reads the test accounts from .env.e2e.
INSERT INTO public.workshop_settings (id, workshop_name, contact_email, email_notifications_enabled)
VALUES (1, 'Test Workshop', 'workshop@example.test', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workshop_admin_contacts (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.feature_flags (key, enabled) VALUES
  ('appointments', true), ('backup_restore', true), ('client_portal', true), ('generate_sample_data', true),
  ('goals', true), ('job_chat', true), ('reports', true), ('setup_demo_users', true)
ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled;
