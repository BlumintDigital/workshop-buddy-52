-- Test database only: the tables production streams live changes for. The
-- public-schema dump doesn't carry publication membership.
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.broadcasts, public.feature_flags, public.job_comments, public.system_notices, public.workshop_settings;
