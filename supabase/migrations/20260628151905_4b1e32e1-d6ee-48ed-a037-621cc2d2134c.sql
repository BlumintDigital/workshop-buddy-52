CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON public.broadcasts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_notices_created ON public.system_notices(created_at DESC);